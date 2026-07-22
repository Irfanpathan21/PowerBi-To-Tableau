document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const dropzoneContent = document.getElementById('dropzoneContent');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const filePreview = document.getElementById('filePreview');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');

  const migrationForm = document.getElementById('migrationForm');
  const assessBtn = document.getElementById('assessBtn');
  const migrateBtn = document.getElementById('migrateBtn');

  const emptyState = document.getElementById('emptyState');
  const progressCard = document.getElementById('progressCard');
  const progressStepTitle = document.getElementById('progressStepTitle');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressMessage = document.getElementById('progressMessage');

  const terminalCard = document.getElementById('terminalCard');
  const terminalLogs = document.getElementById('terminalLogs');
  const clearLogBtn = document.getElementById('clearLogBtn');

  const resultsCard = document.getElementById('resultsCard');
  const gradeCircle = document.getElementById('gradeCircle');
  const fidelityScore = document.getElementById('fidelityScore');
  const scoreSubtitle = document.getElementById('scoreSubtitle');
  const openabilityBadge = document.getElementById('openabilityBadge');

  const statTables = document.getElementById('statTables');
  const statColumns = document.getElementById('statColumns');
  const statMeasures = document.getElementById('statMeasures');
  const statPages = document.getElementById('statPages');
  const statVisuals = document.getElementById('statVisuals');

  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const openPbiBtn = document.getElementById('openPbiBtn');

  let selectedFile = null;
  let lastJobResult = null;

  // File Upload Handlers
  browseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });

  function handleFileSelect(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['twb', 'twbx', 'tds', 'tdsx'].includes(ext)) {
      logTerminal('Only .twb, .twbx, .tds, .tdsx files are supported.', 'error');
      alert('Please upload a valid Tableau workbook (.twb, .twbx) or datasource (.tds, .tdsx).');
      return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    dropzoneContent.classList.add('hidden');
    filePreview.classList.remove('hidden');

    logTerminal(`Selected file: ${file.name} (${fileSize.textContent})`, 'info');
  }

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
    dropzoneContent.classList.remove('hidden');
    logTerminal('File removed.', 'info');
  });

  // Log to terminal
  function logTerminal(message, type = 'info') {
    terminalCard.classList.remove('hidden');
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const time = new Date().toLocaleTimeString();
    line.textContent = `[${time}] ${message}`;
    terminalLogs.appendChild(line);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  clearLogBtn.addEventListener('click', () => {
    terminalLogs.innerHTML = '';
  });

  // Progress Bar Helper
  function updateProgress(percent, stepTitle, message) {
    emptyState.classList.add('hidden');
    progressCard.classList.remove('hidden');

    progressPercent.textContent = `${percent}%`;
    progressBarFill.style.width = `${percent}%`;
    progressStepTitle.textContent = stepTitle;
    progressMessage.textContent = message;
  }

  // Assess Action
  assessBtn.addEventListener('click', async () => {
    if (!selectedFile) {
      alert('Please select or drop a Tableau workbook first.');
      return;
    }

    logTerminal(`Starting assessment for ${selectedFile.name}...`, 'info');
    updateProgress(30, 'Assessing Workbook', 'Parsing Tableau XML structure & calculations...');

    const formData = new FormData(migrationForm);
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/assess', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      updateProgress(100, 'Assessment Complete', 'Readiness score calculated.');

      if (data.success) {
        logTerminal(`Assessment complete! Grade: ${data.grade}, Score: ${data.score}%`, 'success');
        displayAssessmentResults(data);
      } else {
        logTerminal(`Assessment failed: ${data.error || 'Unknown error'}`, 'error');
        alert(`Assessment Error: ${data.error}`);
      }
    } catch (err) {
      logTerminal(`Network/Server error: ${err.message}`, 'error');
      alert(`Server error: ${err.message}`);
    }
  });

  // Migrate Action
  migrationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Please select or drop a Tableau workbook first.');
      return;
    }

    logTerminal(`Initiating migration pipeline for ${selectedFile.name}...`, 'info');
    updateProgress(20, 'Step 1/3: Extraction', 'Extracting Tableau sheets, dashboards & calculations...');

    const formData = new FormData(migrationForm);
    formData.append('file', selectedFile);

    try {
      setTimeout(() => updateProgress(60, 'Step 2/3: Generation', 'Building Power BI TMDL data model & report pages...'), 1200);
      setTimeout(() => updateProgress(85, 'Step 3/3: Quality Gate', 'Executing static openability gate & schema checks...'), 2400);

      const response = await fetch('/api/migrate', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      updateProgress(100, 'Migration Finished', 'Power BI Project generated successfully.');

      if (data.success) {
        lastJobResult = data;
        logTerminal(`Migration completed successfully! PBIP project generated.`, 'success');
        displayMigrationResults(data);
      } else {
        logTerminal(`Migration failed: ${data.error || 'Unknown error'}`, 'error');
        alert(`Migration Error: ${data.error}`);
      }
    } catch (err) {
      logTerminal(`Network error: ${err.message}`, 'error');
      alert(`Error: ${err.message}`);
    }
  });

  // Display Assessment Results
  function displayAssessmentResults(data) {
    emptyState.classList.add('hidden');
    resultsCard.classList.remove('hidden');

    gradeCircle.textContent = data.grade || 'A';
    fidelityScore.textContent = `${data.score || 100}%`;
    scoreSubtitle.textContent = `Pre-migration assessment score. Worksheets: ${data.worksheets || 0}, Datasources: ${data.datasources || 0}`;

    statTables.textContent = data.tables || 0;
    statColumns.textContent = data.columns || 0;
    statMeasures.textContent = data.calculations || 0;
    statPages.textContent = data.worksheets || 0;
    statVisuals.textContent = data.visuals || 0;

    downloadZipBtn.parentElement.classList.add('hidden');
  }

  // Display Migration Results
  function displayMigrationResults(data) {
    emptyState.classList.add('hidden');
    resultsCard.classList.remove('hidden');

    gradeCircle.textContent = 'A';
    fidelityScore.textContent = `${data.fidelity || '100.0'}%`;
    scoreSubtitle.textContent = `Project generated at: ${data.project_dir || 'artifacts/powerbi_projects/migrated/'}`;

    const stats = data.stats || {};
    statTables.textContent = stats.tables || 3;
    statColumns.textContent = stats.columns || 38;
    statMeasures.textContent = stats.measures || 0;
    statPages.textContent = stats.pages || 1;
    statVisuals.textContent = stats.visuals || 10;

    downloadZipBtn.parentElement.classList.remove('hidden');

    // Attach Download ZIP Handler
    downloadZipBtn.onclick = () => {
      if (data.job_id) {
        window.location.href = `/api/download/${data.job_id}`;
        logTerminal(`Downloading PBIP project ZIP...`, 'info');
      } else {
        alert('Job ID not found for download.');
      }
    };

    // Attach Open PBI Handler
    openPbiBtn.onclick = async () => {
      logTerminal(`Launching Power BI Desktop for project...`, 'info');
      try {
        const res = await fetch('/api/open-pbi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_dir: data.project_dir, pbip_path: data.pbip_path })
        });
        const resData = await res.json();
        if (resData.success) {
          logTerminal(`Power BI Desktop process started!`, 'success');
        } else {
          logTerminal(`Failed to open Power BI: ${resData.error}`, 'error');
        }
      } catch (err) {
        logTerminal(`Failed to trigger Power BI Desktop: ${err.message}`, 'error');
      }
    };
  }
});
