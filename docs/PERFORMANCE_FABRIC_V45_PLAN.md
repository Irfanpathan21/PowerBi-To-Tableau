# v45 Development Plan: Migration Performance and Fabric Completion

**Status:** Proposed
**Audit date:** 2026-07-15
**Scope:** Migration runtime and memory, plus the complete Fabric path:
Dataflow Gen2 -> Lakehouse -> Direct Lake semantic model -> Power BI report.

## 1. Verified Baseline

### 1.1 Migration performance

The repository already has useful foundations:

- phase timing and optional JSONL telemetry in `powerbi_import/telemetry.py`;
- `cProfile` and `tracemalloc` support in `scripts/profile_migration.py`;
- batch parallelism through `ThreadPoolExecutor` and `--workers`;
- batch resume and incremental migration support;
- table fingerprint caches for shared-model assessment;
- performance tests in `tests/test_performance.py`,
  `tests/test_performance_regression.py`, `tests/test_perf_benchmark.py`,
  `tests/test_merge_performance.py`, and the enterprise-scale suites.

Measured on the current Windows development machine:

| Scenario | Result | Current budget | Status |
|---|---:|---:|---|
| Superstore, Fabric CLI, full local generation | 1.42 s | Not defined | Baseline |
| Enterprise_Sales PBIP regression fixture | 6.10 s | 5.00 s | Over budget |
| Complex_Enterprise PBIP regression fixture | 14.38 s | 5.00 s | Over budget |
| Performance suites | 28 passed, 2 failed | 30 passing | Needs work |

These numbers are a local baseline, not a cross-machine SLA. CI budgets must use a
pinned runner class, warm-up, and the median of at least three measured runs before
tighter thresholds become blocking.

### 1.2 Fabric path

A real CLI run was executed with:

```powershell
.venv\Scripts\python.exe migrate.py `
  examples\tableau_samples\Superstore_Sales.twb `
  --output-format fabric --output-dir $env:TEMP\ttpbi-fabric-audit
```

The CLI import boundary was broken (`attempted relative import with no known parent
package`) and was corrected to import the Fabric generators through the
`powerbi_import` package. The run now completes and produces the five current
artifact directories.

| Component | Present | Operational contract | Verified finding |
|---|---|---|---|
| Lakehouse | Yes | Partial | Table schemas, DDL, and metadata exist; no `.platform` manifest |
| Dataflow Gen2 | Yes | Partial | M queries and Lakehouse destinations exist; no concrete Lakehouse/workspace binding |
| Notebook | Yes | Partial | ETL and transformation notebooks exist; no `.platform` manifest or concrete Lakehouse ID |
| Semantic model | Yes | No | Metadata says `DirectLake`, but generated TMDL partitions are M/import partitions |
| Pipeline | Yes | Partial | Dependency order exists, but workspace/item IDs remain placeholders |
| Power BI report, shared model | Yes | Partial | Thin reports use a valid local `byPath` reference |
| Power BI report, single workbook | No | No | No `.Report` artifact is generated |
| Native Fabric deployment | No | No | Current bundle deployment handles semantic models and reports, not the full native chain |

Current focused regression status after the CLI import correction:

- Fabric and CLI suites: **173 passed**.
- Existing tests validate file generation well, but do not yet prove true Direct Lake
  partitions, concrete destination binding, native deployment, or a single-workbook
  Power BI report.

## 2. v45 Outcomes

v45 is complete only when both outcomes are true:

1. Migration performance is measured by stable phase-level benchmarks and the two
   current regressions are back within their approved budgets without reducing
   fidelity or skipping validation.
2. `--output-format fabric` produces or deploys a coherent chain:
   Dataflow Gen2 -> Lakehouse -> true Direct Lake semantic model -> Power BI report,
   with a closed pipeline dependency graph and resolvable artifact identities.

Correctness gates take precedence over speed. A faster incomplete artifact does not
pass a performance benchmark.

## 3. Sprint 222: Performance Baseline and Observability

**Owners:** @orchestrator, @tester
**Goal:** Make every optimization attributable to a measured phase.

| Item | Files | Deliverable | Acceptance criteria |
|---|---|---|---|
| 222.1 Phase timers | `migrate.py`, `telemetry.py` | Timings for unzip/XML parse, extraction objects, DAX conversion, TMDL, PBIR, Fabric generators, validation, reporting | Every full run emits phase totals whose sum is within 5% of wall time |
| 222.2 Stable benchmark runner | `scripts/profile_migration.py`, new `scripts/run_perf_baseline.py` | JSON baseline with machine/runtime metadata, median, p95, and peak memory | Repeated warm runs vary by less than 15% or are marked non-blocking |
| 222.3 CI performance job | `.github/workflows/ci.yml` | Separate scheduled/manual job; no telemetry network send | Baseline artifacts retained and trend diff produced |
| 222.4 Fabric benchmark coverage | new `tests/test_fabric_performance.py` | Single and shared Fabric generation budgets with output-count assertions | A fast but incomplete bundle fails |
| 222.5 Existing benchmark repair | `tests/test_merge_performance.py` | Use the supported `RUN_BENCHMARKS=1` gate; remove/document invalid `--benchmark` usage | Documented command runs without pytest option errors |

**Exit gate:** A checked-in baseline explains which phase dominates
`Complex_Enterprise` and `Enterprise_Sales`; no optimization starts from wall-clock
speculation alone.

### Sprint 222 measured baseline

Measured on Windows 11, CPython 3.14.2, AMD64, with one warm-up and three
isolated timing runs. Baseline schema v2 measures timing without `tracemalloc`,
then performs one additional memory-only run. Peak figures are Python traced
allocations, not process RSS.

| Fixture | Extract median | Generate median | Total median | p95 | Variation | Status |
|---|---:|---:|---:|---:|---:|---|
| `Enterprise_Sales.twb` PBIP, traced v1 | 0.080 s | 0.656 s | 0.732 s | 0.880 s | 27.87% | Historical only: timing included tracing overhead |
| `Complex_Enterprise.twb` PBIP, traced v1 | 0.161 s | 1.585 s | 1.742 s | 1.916 s | 12.02% | Historical only: timing included tracing overhead |
| `Complex_Enterprise.twb` PBIP, untraced v2 | 0.067 s | 1.239 s | 1.294 s | 1.386 s | 11.64% | Stable reference |
| `Superstore_Sales.twb` Fabric control run | 0.073 s | 0.771 s | 0.844 s | 0.844 s | n/a | Six local artifacts validated; single run only |

The stable v2 fixture attributes about 96% of measured wall time to PBIP generation,
so Sprint 223 must profile TMDL/PBIR generation before considering XML extraction
pass reduction. The scheduled/manual CI job retains PBIP and Fabric JSON baselines;
historical trend comparison remains pending until the first Linux reference series
has been collected.

A controlled experiment parallelizing the 21 small JSON reads in report
self-healing increased the instrumented pipeline from about 3.75 s to 4.35 s due
to thread overhead. The change was reverted; all 25 report healers remain enabled.
CPU profiling now leaves `tracemalloc` disabled by default and exposes it only via
`scripts/profile_migration.py --memory`.

## 4. Sprint 223: Hot-Path Optimization

**Owners:** @extractor, @dax, @semantic, @visual, @orchestrator
**Goal:** Remove measured duplicate work while preserving generated artifacts.

Implementation order is determined by Sprint 222 profiles. Candidate work, in likely
priority order:

| Item | Candidate files | Change | Acceptance criteria |
|---|---|---|---|
| 223.1 Extraction pass reduction | `extract_tableau_data.py`, `datasource_extractor.py` | Cache XML indexes or pilot `iterparse` for the largest independent sections | At least 25% extraction-time reduction on the dominant fixture; identical 23 JSON outputs modulo ordering/timestamps |
| 223.2 DAX conversion reuse | `dax_converter.py`, `tmdl_generator.py` | Cache conversion by formula plus context; avoid repeated validation/conversion of identical expressions | Cache hit rate reported; DAX snapshots unchanged |
| 223.3 Relationship lookup indexes | `tmdl_generator.py` | Pre-index tables/columns and cache repeated relationship candidates | Relationship phase under 2 s for the 50-table synthetic model |
| 223.4 PBIR write batching | `pbip_generator.py`, `visual_generator.py` | Avoid repeated serialization and directory scans | Visual output byte-equivalent after normalized volatile fields |
| 223.5 Shared-model candidate index | `global_assessment.py`, `shared_model.py` | Reuse/invert existing table fingerprints before pairwise scoring | 100-workbook assessment under 5 s on the reference runner |
| 223.6 Incremental shared-model resume | `migrate.py`, `incremental.py`, `merge_manifest.py` | Skip unchanged extraction/merge inputs based on source fingerprints | Unchanged 100-workbook rerun under 2 s excluding startup |

**Performance targets on the reference Windows runner:**

- `Enterprise_Sales`: <= 5.0 s, target <= 4.0 s.
- `Complex_Enterprise`: first gate <= 8.0 s, release gate <= 5.0 s.
- No measured PBIP or Fabric fixture regresses by more than 10%.
- Peak memory does not exceed the current fixture baseline or 500 MB, whichever is
  lower, for standard performance fixtures.

## 5. Sprint 224: True Direct Lake and Cross-Artifact Contract

**Owners:** @generator, @semantic, @wiring, @tester
**Goal:** Replace metadata-only Direct Lake labeling with a real Direct Lake model.

| Item | Files | Deliverable | Acceptance criteria |
|---|---|---|---|
| 224.1 Canonical table-name map | `fabric_naming.py`, all Fabric generators | One source-to-Lakehouse/entity/model name registry | Punctuation, Unicode, case, and collisions resolve identically in all artifacts |
| 224.2 Deployable item manifests | Lakehouse, Dataflow, Notebook generators | `.platform` and item definitions for every Fabric item | Every artifact has a valid type, logical ID, display name, and schema |
| 224.3 Dataflow destination binding | `dataflow_generator.py` | Logical Lakehouse destination reference and connection binding contract | Every query destination resolves to exactly one generated Lakehouse table |
| 224.4 Direct Lake partitions | `fabric_semantic_model_generator.py`, `tmdl_generator.py` | Entity/Direct Lake partitions bound to the Lakehouse SQL analytics endpoint | No Fabric semantic-model table uses `partition ... = m` with `mode: import`; metadata and TMDL agree |
| 224.5 Fabric cross-validator | new `fabric_validator.py` | Validate manifests, table mapping, destinations, partitions, report refs, and pipeline graph | `--output-format fabric` fails with `VALIDATION_FAILED` on any blocking cross-artifact defect |

**Exit gate:** The Direct Lake assertion inspects TMDL partitions and bindings, not
`semantic_model_metadata.json` alone.

## 6. Sprint 225: Pipeline, Power BI Report, and Native Deployment

**Owners:** @generator, @visual, @deployer, @orchestrator, @tester
**Goal:** Make the complete Fabric chain executable and consumable from Power BI.

| Item | Files | Deliverable | Acceptance criteria |
|---|---|---|---|
| 225.1 Single-workbook PBIR report | `fabric_project_generator.py`, `pbip_generator.py` or `thin_report_generator.py` | `.Report` generated from original dashboards/worksheets | Report `byPath` resolves locally to the generated semantic model and all fields cross-validate |
| 225.2 Logical binding manifest | new `fabric_bindings.json` producer | Stable logical IDs for every artifact before deployment | No anonymous repeated `{{..._ID}}` placeholder remains in a release bundle |
| 225.3 Pipeline closure | `pipeline_generator.py` | One refresh per generated Dataflow, ETL plus optional transformations notebook, then model refresh | Unique activities, closed acyclic graph, all dependencies resolve |
| 225.4 Native deployment order | `deploy/bundle_deployer.py`, `deploy/deployer.py` | Lakehouse -> Dataflow -> Notebook -> SemanticModel -> Report -> Pipeline | Created item IDs are substituted/rebound and rollback covers partial failure |
| 225.5 Post-deploy validation | deployment modules | Verify item status, Dataflow destination, model binding, report binding, and pipeline references | Opt-in live Fabric test creates, validates, and deletes an isolated test bundle |
| 225.6 CLI messaging | `migrate.py` | Fabric-specific summary and next steps | Fabric output never claims a `.pbip` exists or that Desktop validation ran |

## 7. Sprint 226: Performance Gates and v45 Release

**Owners:** @tester, @reviewer, all owning agents
**Goal:** Turn the new contracts and budgets into release gates.

Required test matrix:

- CLI: real single-workbook Fabric generation, not parser-only.
- Artifacts: manifests and definitions for all six item types.
- Data: Dataflow destination tables match Lakehouse tables.
- Model: true Direct Lake partitions reference the generated Lakehouse endpoint.
- Report: local `byPath` and deployed `byConnection` both resolve.
- Pipeline: no unresolved generic placeholders; graph closed and acyclic.
- Deployment: mocked atomic deployment plus opt-in live Fabric smoke test.
- Performance: PBIP and Fabric single/shared fixtures, warm median and peak memory.
- Fidelity: normalized output snapshots and existing parity/openability checks remain
  green.

Release gates:

| Gate | Required result |
|---|---|
| Focused Fabric contracts | 100% passing |
| Existing PBIP regression | 100% passing |
| Performance regression | Both current failures resolved; no >10% new regression |
| Fabric generation performance | Superstore complete six-artifact chain <= 2.0 s on reference runner |
| Large-workbook memory | <= 500 MB for standard benchmark; <= 2 GB for 500-measure stress fixture |
| Native live smoke test | Passing in an isolated Fabric workspace before release |
| Documentation | README, architecture, roadmap, deployment guide, and known limitations agree |

## 8. Definition of Done

The Fabric option may be described as production-ready only when:

1. The CLI generates successfully through package imports.
2. Dataflow destinations resolve to generated Lakehouse tables.
3. TMDL contains true Direct Lake partitions and endpoint binding.
4. A Power BI report is generated for both single and shared modes.
5. Pipeline targets resolve to actual logical or deployed item IDs.
6. Native deployment creates all item types in dependency order and can roll back.
7. Static cross-artifact validation and the opt-in live smoke test both pass.
8. Performance budgets pass without fidelity or validation bypasses.

Until those gates pass, documentation should use **Fabric scaffold / preview** rather
than **complete production-ready Direct Lake migration**.
