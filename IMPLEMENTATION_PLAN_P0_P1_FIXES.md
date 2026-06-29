# P0/P1 Bug Fix Implementation Plan (Session 6)

## Context
- Quality report saved: `docs/MIGRATION_QUALITY_REPORT_v40.0.0_hotfix.md`
- 28 bugs identified, 5 already fixed (hotfix v40.0.0)
- Focus: Implement 7 remaining critical fixes (P0 + P1 priority)
- Current fidelity: 97.3% exact match across 76 workbooks
- Blockers: 16 workbooks cannot open / have runtime errors

---

## P0 Fixes (Critical - Blocking)

### Bug #1: Missing report.json
**File**: `powerbi_import/pbip_generator.py`  
**Problem**: When workbooks have no worksheets/dashboards, `create_report_structure()` is never called → no `report.json` → PBI Desktop cannot open  
**Impact**: 11 workbooks blocked (DOAAT: 2, DPN: 2, SEI: 3, UDAP: 4)  
**Location**: Line ~280 in `generate_project()` method  
**Fix Required**:
```python
# BEFORE (line 275-281):
if self._output_format in ('pbip', 'pbir') and has_visuals:
    report_dir = self.create_report_structure(...)
    # report.json created
elif not has_visuals:
    print("Datasource-only mode...")

# AFTER:
if self._output_format in ('pbip', 'pbir'):
    report_dir = self.create_report_structure(...)
    # Always called, report.json always created, even if empty
```

### Bug #2b: Duplicate columns with apostrophes
**File**: `powerbi_import/tmdl_generator.py`  
**Problem**: French names like "Date d'émission" → internal apostrophes cause truncation → "Date d'" duplicated → multiple columns with same name  
**Impact**: 5 workbooks blocked (TdB Daily-R7: 116 duplicate columns, CRAC_2022: 2, ESOMS: 1, etc.)  
**Locations**:
- Line 6050: `_quote_name()` function (already handles apostrophe escaping `'' `)
- Line 3389: Measure dedup implementation (template for column dedup)

**Fix Required**:
```python
# After measure deduplication (line ~3400), add column deduplication:
# Deduplicate columns globally with case-insensitive uniqueness
for table in model["model"]["tables"]:
    seen_cols = {}  # casefold -> column dict
    unique_cols = []
    for col in table.get("columns", []):
        cname = col.get("name", "")
        key = cname.casefold()
        if key in seen_cols:
            print(f"  ⚕ Self-heal: Dropped duplicate column '{cname}'")
            continue
        seen_cols[key] = col
        unique_cols.append(col)
    table["columns"] = unique_cols
```

**Why apostrophes fail**: TMDL delimiter `'` needs escaping as `''` for internal quotes. If not escaped, parser truncates at first unescaped `'`. Use `_quote_name()` when building column names.

---

## P1 Fixes (High Priority - Data/Visual Issues)

### Bug #20: NULL keyword not valid in DAX
**File**: `tableau_export/dax_converter.py`  
**Problem**: Converts `NULL()` to `NULL()` (invalid DAX keyword) → should be `BLANK()`  
**Impact**: 13+ workbooks with runtime errors on load  
**Location**: Line ~60 in `_SIMPLE_FUNCTION_MAP` or post-conversion cleanup  
**Fix Required**:
```python
# Add post-generation pass in convert_tableau_formula_to_dax():
dax_formula = re.sub(r'\bNULL\b', 'BLANK()', dax_formula, flags=re.IGNORECASE)
# Exclude string literals: don't replace inside double quotes
```

### Bug #26: SPLIT() function has no DAX equivalent
**File**: `tableau_export/dax_converter.py`  
**Problem**: SPLIT(text, delim, 1) not converted → formulas skipped  
**Impact**: 16 items skipped in 3 workbooks (OGDAA, OGDAA_ESPADON)  
**Patterns to handle**:
- `INT(SPLIT([field], "_", 1))` → `INT(LEFT([field], FIND("_", [field]) - 1))`
- `INT(SPLIT([field], "_", 2))` → `INT(MID([field], FIND("_", [field]) + 1, LEN([field])))`

**Fix Required**:
```python
def _convert_split(match, formula):
    """Convert SPLIT(text, delimiter, part_number) to LEFT/MID/RIGHT"""
    # Extract arguments
    text = ...
    delim = ...
    part_num = ...
    if part_num == 1:
        return f"LEFT({text}, FIND({delim}, {text}) - 1)"
    elif part_num == 2:
        return f"MID({text}, FIND({delim}, {text}) + LEN({delim}), LEN({text}))"
    # ... etc for parts 3+
```

### Bug #21: SELECTEDVALUE invalid in calc column row context
**File**: `powerbi_import/tmdl_generator.py` (cross-table calc column handling)  
**Problem**: `CALCULATE(SELECTEDVALUE(...))` used for cross-table column refs → invalid in row context → runtime error  
**Impact**: 1 blocked + 4 runtime errors  
**Fix Required**: Replace with `LOOKUPVALUE()` for manyToOne relationships:
```python
# When generating cross-table calc column expressions:
# BEFORE: CALCULATE(SELECTEDVALUE('OtherTable'[col]))
# AFTER: LOOKUPVALUE('OtherTable'[col], ...)
```

### Bug #22: Measure/column name collision
**File**: `powerbi_import/tmdl_generator.py`  
**Problem**: PBI forbids same name (case-insensitive) for measure and column → model fails to load  
**Impact**: 2 workbooks blocked  
**Fix Required** (pre-generation check):
```python
# Before emitting measures, check collision with all columns:
all_col_names = {col.get('name', '').casefold() for table in model['model']['tables'] for col in table.get('columns', [])}
for measure in all_measures:
    if measure.get('name', '').casefold() in all_col_names:
        # Rename measure with (Measure) suffix
        measure['name'] = f"{measure['name']} (Measure)"
```

### Bug #6: Cross-datasource ID suffix resolution
**File**: `tableau_export/datasource_extractor.py`  
**Problem**: Formulas reference `[Calculation_NNNNNNNNNNNNNNNN]` (18-digit ID suffix) from other datasources → not resolved → calculations skipped  
**Impact**: 33+ items skipped across 3 workbooks (DPN: CHO_CIV_REX_DM, OGDAA, OGDAA_ESPADON)  
**Fix Required**: In calculation reference resolution, add fallback:
```python
# When resolving [Calculation_NNNN]:
# 1. Look in same datasource (current behavior)
# 2. If not found, search all datasources by suffix match
# 3. Resolve to actual calculation name from matching datasource
```

---

## Implementation Sequence

### Phase 1 (P0 - Critical)
1. **Bug #1**: Modify `pbip_generator.py` line 280 → always call `create_report_structure()`
2. **Bug #2b**: Add column dedup to `tmdl_generator.py` line ~3400

### Phase 2 (P1 - Data quality)
3. **Bug #20**: Add NULL→BLANK regex to `dax_converter.py`
4. **Bug #26**: Add SPLIT() converter functions to `dax_converter.py`
5. **Bug #21**: Update cross-table calc column logic in `tmdl_generator.py`
6. **Bug #22**: Add pre-generation collision check in `tmdl_generator.py`
7. **Bug #6**: Add cross-datasource resolution to `datasource_extractor.py`

---

## Testing Strategy

After each fix, validate:
- **Bug #1**: Open a datasource-only workbook in PBI Desktop (no errors)
- **Bug #2b**: Load TdB Daily-R7 → verify no duplicate columns
- **Bug #20**: Run workbooks with NULL() → no DAX errors
- **Bug #26**: OGDAA items appear (not skipped)
- **Bug #21**: Complex cross-table formulas calculate correctly
- **Bug #22**: Models with name collisions load without errors
- **Bug #6**: Cross-datasource references resolve

---

## Expected Impact

Upon completion:
- **11 workbooks** (Bug #1) → unblocked
- **5 workbooks** (Bug #2b) → duplicate columns eliminated
- **13+ workbooks** (Bug #20) → runtime errors eliminated
- **3 workbooks** (Bug #26) → 16 skipped items recovered
- **5 workbooks** (Bug #21, #22) → runtime/load errors fixed
- **3 workbooks** (Bug #6) → 33+ skipped items recovered

**Result**: ~23 previously blocked/errored workbooks now working. Fidelity baseline: 97.3% → estimated 98.5%+

---

## Notes
- All changes use existing helper functions (`_quote_name`, measure dedup pattern, DAX conversion framework)
- No new external dependencies required
- Changes are backward compatible (defensive programming)
- Self-healing code already in place to report fixes applied
