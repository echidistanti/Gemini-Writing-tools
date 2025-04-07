// State variables
const State = {
  prompts: [],
  originalPrompts: [],
  hasUnsavedChanges: false,
  selectedModel: '',
  
  setPrompts(newPrompts) {
    this.prompts = newPrompts;
    this.hasUnsavedChanges = true;
    updateSaveButtonState();
    updatePromptsTable();
  },
  
  resetChanges() {
    this.hasUnsavedChanges = false;
    updateSaveButtonState();
  }
};

let dragSource = null;

// Utility Functions
function createUniqueElement(tag, id) {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement(tag);
    element.id = id;
  }
  return element;
}

// Replace multiple prompt storage functions with a single one
async function handlePrompts(action, data = null) {
  switch(action) {
    case 'save':
      await Storage.set({ customPrompts: State.prompts });
      State.originalPrompts = JSON.parse(JSON.stringify(State.prompts));
      State.resetChanges();
      break;
    case 'load':
      const result = await Storage.get(['customPrompts']);
      return result.customPrompts || [];
    case 'sync':
      await Storage.set({ customPrompts: State.prompts });
      return State.prompts;
  }
}

// Funzione per mostrare il contenuto dello storage
function backupStorage() {
  chrome.storage.sync.get(null, function(items) {
    if (chrome.runtime.lastError) {
      console.error('Errore nel recupero dello storage:', chrome.runtime.lastError);
      alert('Errore nel recupero dello storage');
    } else {
      const storageContent = JSON.stringify(items, null, 2);
      console.log('Contenuto dello storage:', storageContent);
      alert(`Contenuto dello storage:\n${storageContent}`);
    }
  });
}

// Export function - simplified for JSON
async function exportSettings() {
  try {
    const settings = await chrome.storage.sync.get(['apiKey', 'customPrompts', 'selectedModel']);
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: {
        customPrompts: settings.customPrompts || [],
        apiKey: settings.apiKey || '',
        selectedModel: settings.selectedModel || '' // Added selectedModel
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-text-tools-settings-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Export failed:', error);
    alert('Error exporting settings');
  }
}

// Import function - simplified for JSON
async function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Check file type and extension
  if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
    alert('Please select a valid JSON file.');
    return;
  }

  try {
    const text = await file.text();
    const importedData = JSON.parse(text);

    // Validate the structure of the imported data
    if (!importedData.settings || typeof importedData.settings !== 'object') {
      throw new Error('Invalid file format');
    }

    // Save settings to chrome.storage
    await chrome.storage.sync.set({
      apiKey: importedData.settings.apiKey || '',
      customPrompts: importedData.settings.customPrompts || [],
      selectedModel: importedData.settings.selectedModel || '' // Added selectedModel
    });

    // Reload settings and update UI if needed
    await loadSettings();

    alert('Import successful');
    event.target.value = ''; // Reset file input value
  } catch (error) {
    console.error('Error importing settings:', error);
    alert('Error importing settings: ' + error.message);
  }
}

// API Key functions
function showApiKeyStatus() {
  const apiKeyInput = document.getElementById('apiKey');
  let statusElement = document.querySelector('.api-key-status');
  if (!statusElement) {
    statusElement = document.createElement('span');
    statusElement.className = 'api-key-status';
    apiKeyInput.parentNode.appendChild(statusElement);
  }
  statusElement.className = 'api-key-status valid';
  statusElement.textContent = 'API key saved';
}

// Load and Save functions
async function loadSettings() {
  try {
    await loadSelectedModel(); // Load the selected model first
    const result = await chrome.storage.sync.get(['apiKey', 'customPrompts']);
    console.log('Loading settings:', result);

    const apiKeyInput = document.getElementById('apiKey');
    if (apiKeyInput && result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }

    // Inizializzazione più robusta dell'array prompts
    State.setPrompts(Array.isArray(result.customPrompts) ? result.customPrompts : []);
    
    // Se non ci sono prompt, inizializziamo con un array vuoto
    if (!Array.isArray(result.customPrompts)) {
      await chrome.storage.sync.set({ customPrompts: [] });
    }

    State.originalPrompts = JSON.parse(JSON.stringify(State.prompts));
    updatePromptsTable();
    updateSaveButtonState();
  } catch (error) {
    console.error('Error loading settings:', error);
    alert('Error loading settings');
  }
}

async function saveApiKey() {
  const apiKey = document.getElementById('apiKey').value;
  try {
    await chrome.storage.sync.set({ apiKey });
    await chrome.runtime.sendMessage({ action: 'updateApiKey', apiKey });
    showApiKeyStatus();
    showSaveStatus();
  } catch (error) {
    console.error('Error saving API key:', error);
    alert('Error saving API key');
  }
}

// HTML Utility
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Prompts Table Management
function updatePromptsTable() {
  const tbody = document.querySelector('#promptsTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  State.prompts.forEach((prompt, index) => {
    const tr = document.createElement('tr');
    tr.className = 'prompt-row';
    tr.draggable = true;
    tr.dataset.id = prompt.id;

    const originalPrompt = State.originalPrompts.find(p => p.id === prompt.id);
    const isModified = originalPrompt && (originalPrompt.name !== prompt.name || originalPrompt.prompt !== prompt.prompt);

    if (isModified) {
      tr.classList.add('modified');
    }

    tr.innerHTML = `
      <td style="display: flex; align-items: center;">
        <span class="drag-handle"></span>
        <span class="prompt-order">${index + 1}</span>
        <input type="text" value="${escapeHtml(prompt.name)}" 
               data-id="${prompt.id}" 
               data-field="name" 
               class="prompt-input">
      </td>
      <td>
        <input type="text" value="${escapeHtml(prompt.prompt)}" 
               data-id="${prompt.id}" 
               data-field="prompt" 
               class="prompt-input">
      </td>
      <td>
        <button class="button delete" data-id="${prompt.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);

    // Add drag and drop listeners
    tr.addEventListener('dragstart', handleDragStart);
    tr.addEventListener('dragend', handleDragEnd);
    tr.addEventListener('dragover', handleDragOver);
    tr.addEventListener('drop', handleDrop);
    tr.addEventListener('dragenter', handleDragEnter);
    tr.addEventListener('dragleave', handleDragLeave);
  });

  document.querySelectorAll('.prompt-input').forEach(input => {
    input.addEventListener('input', function() {
      const id = parseInt(this.dataset.id);
      const field = this.dataset.field;
      updatePrompt(id, field, this.value);
    });
  });

  document.querySelectorAll('.button.delete').forEach(button => {
    button.addEventListener('click', function() {
      const id = parseInt(this.dataset.id);
      deletePrompt(id);
    });
  });
}

// Drag and Drop Handlers
function handleDragStart(e) {
  dragSource = this;
  this.classList.add('dragging');
  if (e.target.tagName.toLowerCase() === 'input') {
    e.preventDefault();
  }
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.prompt-row').forEach(row => {
    row.classList.remove('drop-target');
  });
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();

  if (dragSource !== this) {
    const allRows = Array.from(document.querySelectorAll('.prompt-row'));
    const sourceIndex = allRows.indexOf(dragSource);
    const targetIndex = allRows.indexOf(this);

    const [removed] = State.prompts.splice(sourceIndex, 1);
    State.prompts.splice(targetIndex, 0, removed);

    State.hasUnsavedChanges = true;
    updatePromptsTable();
    updateSaveButtonState();
  }

  return false;
}

function handleDragEnter(e) {
  this.classList.add('drop-target');
}

function handleDragLeave(e) {
  this.classList.remove('drop-target');
}

// Prompt Management Functions
function updatePrompt(id, field, value) {
  const promptIndex = State.prompts.findIndex(p => p.id === id);
  if (promptIndex !== -1) {
    State.prompts[promptIndex] = {
      ...State.prompts[promptIndex],
      [field]: value
    };
    State.hasUnsavedChanges = true;
    updateSaveButtonState();
  }
}

function addNewPrompt() {
  // Gestione sicura dell'ID
  const maxId = State.prompts.length > 0 
    ? State.prompts.reduce((max, p) => Math.max(max, p.id || 0), 0) 
    : 0;

  const newPrompt = {
    id: maxId + 1,
    name: 'New Prompt',       // testo statico in plain english
    prompt: 'Enter your prompt here' // testo statico in plain english
  };

  State.prompts.push(newPrompt);
  State.hasUnsavedChanges = true;
  updatePromptsTable();
  updateSaveButtonState();
}

function deletePrompt(id) {
  if (confirm('Are you sure you want to delete this prompt?')) {
    State.prompts = State.prompts.filter(p => p.id !== id);
    State.hasUnsavedChanges = true;
    updatePromptsTable();
    updateSaveButtonState();
  }
}

function validatePrompt(prompt) {
  return prompt &&
    typeof prompt.id === 'number' &&
    typeof prompt.name === 'string' &&
    typeof prompt.prompt === 'string' &&
    prompt.name.trim() !== '' &&
    prompt.prompt.trim() !== '';
}

async function savePrompts() {
  try {
    if (!Array.isArray(State.prompts) || !State.prompts.every(validatePrompt)) {
      throw new Error('Invalid prompts format');
    }

    await handlePrompts('save');
    updatePromptsTable();
    updateSaveButtonState();
    showSaveStatus();
  } catch (error) {
    console.error('Error saving prompts:', error);
    alert('Error saving prompts: ' + error.message);
  }
}

function updateSaveButtonState() {
  const saveButton = document.getElementById('savePrompts');
  if (saveButton) {
    saveButton.disabled = !State.hasUnsavedChanges;
    saveButton.style.opacity = State.hasUnsavedChanges ? '1' : '0.5';
  }
}

function showSaveStatus() {
  const status = document.getElementById('saveStatus');
  if (status) {
    status.style.display = 'inline';
    setTimeout(() => {
      status.style.display = 'none';
    }, 2000);
  }
}

// Unified storage functions
const Storage = {
  async get(keys) {
    return new Promise(resolve => {
      chrome.storage.sync.get(keys, resolve);
    });
  },
  
  async set(data) {
    return new Promise(resolve => {
      chrome.storage.sync.set(data, resolve);
    });
  }
};

async function handleModel(action, modelData = null) {
  const apiKey = await Storage.get(['apiKey']).then(result => result.apiKey);
  if (!apiKey) {
    console.warn('API key not found');
    return null;
  }

  switch(action) {
    case 'fetch':
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        const data = await response.json();
        return data?.models?.map(model => 
          model.name.startsWith('models/') ? model.name.substring(7) : model.name
        ) || [];
      } catch (error) {
        console.error('Failed to fetch models:', error);
        return [];
      }
      
    case 'save':
      await Storage.set({ selectedModel: modelData });
      State.selectedModel = modelData; // Aggiorna lo stato
      showSaveStatus(); // Mostra feedback di salvataggio
      return modelData;
  }
}

// Correzione nel eventMap
const eventMap = {
  'apiKey': { event: 'change', handler: saveApiKey },
  'addPrompt': { event: 'click', handler: addNewPrompt },
  'savePrompts': { event: 'click', handler: savePrompts },
  'modelSelect': { 
    event: 'change', 
    handler: function() {
      const modelSelect = document.getElementById('modelSelect');
      if (modelSelect) {
        handleModel('save', modelSelect.value);
      }
    }
  },
  'exportSettings': { event: 'click', handler: exportSettings }
};

function setupEventListeners() {
  Object.entries(eventMap).forEach(([id, { event, handler }]) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener(event, handler);
    }
  });

  // Special case for import functionality
  const importSettingsButton = document.getElementById('importSettings');
  const importFileInput = document.getElementById('importFile');
  if (importSettingsButton && importFileInput) {
    importSettingsButton.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importSettings);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  await populateModelDropdown(); // Populate the dropdown after loading settings and setting up listeners
});

// Confirm before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (State.hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Function to populate the model selection dropdown
async function populateModelDropdown() {
  const modelSelect = document.getElementById('modelSelect');
  if (!modelSelect) return;

  const models = await handleModel('fetch');
  
  // Pulisci le opzioni esistenti
  modelSelect.innerHTML = '';
  
  // Aggiungi l'opzione di default
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select a model';
  modelSelect.appendChild(defaultOption);

  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });

  // Imposta il modello selezionato
  if (State.selectedModel) {
    modelSelect.value = State.selectedModel;
  }
}

// Function to load the selected model from storage
async function loadSelectedModel() {
  try {
    const result = await Storage.get(['selectedModel']);
    State.selectedModel = result.selectedModel || '';
    console.log('Loaded selected model:', State.selectedModel);
  } catch (error) {
    console.error('Error loading selected model:', error);
  }
}