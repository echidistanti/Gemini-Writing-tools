// State variables
let prompts = [];
let originalPrompts = [];
let hasUnsavedChanges = false;
let dragSource = null;

// State variable for the selected model
let selectedModel = '';

// Utility Functions
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function showTokenCounter(text) {
  let tokenCounter = document.querySelector('.token-counter');
  if (!tokenCounter) {
    tokenCounter = document.createElement('div');
    tokenCounter.className = 'token-counter';
    document.body.appendChild(tokenCounter);
  }

  const tokens = estimateTokens(text);
  const maxTokens = 4000;

  tokenCounter.className = 'token-counter';
  if (tokens > maxTokens) {
    tokenCounter.classList.add('error');
  } else if (tokens > maxTokens * 0.8) {
    tokenCounter.classList.add('warning');
  }

  tokenCounter.textContent = `Tokens: ${tokens}/${maxTokens}`;
}

function createUniqueElement(tag, id) {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement(tag);
    element.id = id;
  }
  return element;
}

// Funzione per salvare i prompt custom
function saveCustomPrompts(prompts) {
  chrome.storage.sync.set({ customPrompts: prompts }, function() {
    if (chrome.runtime.lastError) {
      console.error('Errore nel salvataggio dei prompt custom:', chrome.runtime.lastError);
    } else {
      console.log('Prompt custom salvati nello storage sync.');
    }
  });
}

// Funzione per recuperare i prompt custom
function getCustomPrompts(callback) {
  chrome.storage.sync.get(['customPrompts'], function(result) {
    if (chrome.runtime.lastError) {
      console.error('Errore nel recupero dei prompt custom:', chrome.runtime.lastError);
    } else {
      console.log('Prompt custom recuperati dallo storage sync:', result.customPrompts);
      callback(result.customPrompts || []);
    }
  });
}

// Funzione per sincronizzare i prompt custom
function syncCustomPrompts() {
  chrome.storage.sync.set({ customPrompts: prompts }, function() {
    console.log('Prompt custom sincronizzati nello storage sync.');
    alert('Prompt custom sincronizzati con successo!');
  });
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
    prompts = Array.isArray(result.customPrompts) ? result.customPrompts : [];
    
    // Se non ci sono prompt, inizializziamo con un array vuoto
    if (!Array.isArray(result.customPrompts)) {
      await chrome.storage.sync.set({ customPrompts: [] });
    }

    originalPrompts = JSON.parse(JSON.stringify(prompts));
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

  prompts.forEach((prompt, index) => {
    const tr = document.createElement('tr');
    tr.className = 'prompt-row';
    tr.draggable = true;
    tr.dataset.id = prompt.id;

    const originalPrompt = originalPrompts.find(p => p.id === prompt.id);
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
      showTokenCounter(this.value);
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

    const [removed] = prompts.splice(sourceIndex, 1);
    prompts.splice(targetIndex, 0, removed);

    hasUnsavedChanges = true;
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
  const promptIndex = prompts.findIndex(p => p.id === id);
  if (promptIndex !== -1) {
    prompts[promptIndex] = {
      ...prompts[promptIndex],
      [field]: value
    };
    hasUnsavedChanges = true;
    updateSaveButtonState();
  }
}

function addNewPrompt() {
  // Gestione sicura dell'ID
  const maxId = prompts.length > 0 
    ? prompts.reduce((max, p) => Math.max(max, p.id || 0), 0) 
    : 0;

  const newPrompt = {
    id: maxId + 1,
    name: 'New Prompt',       // testo statico in plain english
    prompt: 'Enter your prompt here' // testo statico in plain english
  };

  prompts.push(newPrompt);
  hasUnsavedChanges = true;
  updatePromptsTable();
  updateSaveButtonState();
}

function deletePrompt(id) {
  if (confirm('Are you sure you want to delete this prompt?')) {
    prompts = prompts.filter(p => p.id !== id);
    hasUnsavedChanges = true;
    updatePromptsTable();
    updateSaveButtonState();
  }
}

// Save Functions
async function savePrompts() {
  try {
    // Validazione dei dati prima del salvataggio
    if (!Array.isArray(prompts)) {
      throw new Error('Prompts must be an array');
    }

    // Verifica che ogni prompt abbia i campi richiesti
    const validPrompts = prompts.every(p => 
      p && typeof p.id === 'number' && 
      typeof p.name === 'string' && 
      typeof p.prompt === 'string'
    );

    if (!validPrompts) {
      throw new Error('Invalid prompt format');
    }

    console.log('Saving prompts:', prompts);
    await chrome.storage.sync.set({ customPrompts: prompts });
    originalPrompts = JSON.parse(JSON.stringify(prompts));
    hasUnsavedChanges = false;
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
    saveButton.disabled = !hasUnsavedChanges;
    saveButton.style.opacity = hasUnsavedChanges ? '1' : '0.5';
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

// Function to fetch available models from the Gemini API
async function fetchAvailableModels() {
  try {
    const apiKey = await getApiKey(); // Ottieni la API key dallo storage
    if (!apiKey) {
      console.warn('API key not found. Please set it in the options.');
      return []; // Restituisci un array vuoto se la API key non è impostata
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Assuming the API returns a list of models in the 'models' field
    if (data && Array.isArray(data.models)) {
      // Extract only the model names from the response
      const modelNames = data.models.map(model => model.name);
      return modelNames;
    } else {
      console.error('Invalid model list format:', data);
      return [];
    }
  } catch (error) {
    console.error('Failed to fetch available models:', error);
    return [];
  }
}

// Helper function to get the API key from storage
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey'], (result) => {
      resolve(result.apiKey || '');
    });
  });
}

// Function to populate the model selection dropdown
async function populateModelDropdown() {
  const modelSelect = document.getElementById('modelSelect');
  if (!modelSelect) return;

  const models = await fetchAvailableModels();

  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });

  // Set the selected model after populating the dropdown
  if (selectedModel) {
    modelSelect.value = selectedModel;
  }
}

// Function to save the selected model
async function saveSelectedModel() {
  const modelSelect = document.getElementById('modelSelect');
  if (!modelSelect) return;

  selectedModel = modelSelect.value;
  try {
    await chrome.storage.sync.set({ selectedModel: selectedModel });
    console.log('Selected model saved:', selectedModel);
    showSaveStatus(); // Optional: Show a save confirmation message
  } catch (error) {
    console.error('Error saving selected model:', error);
    alert('Error saving selected model');
  }
}

// Function to load the selected model from storage
async function loadSelectedModel() {
  try {
    const result = await chrome.storage.sync.get(['selectedModel']);
    selectedModel = result.selectedModel || '';
    console.log('Loaded selected model:', selectedModel);
  } catch (error) {
    console.error('Error loading selected model:', error);
  }
}

// Event Listeners Setup
function setupEventListeners() {
  const apiKeyInput = document.getElementById('apiKey');
  const addPromptButton = document.getElementById('addPrompt');
  const savePromptsButton = document.getElementById('savePrompts');
  const saveApiKeyButton = document.getElementById('saveApiKey');
  const exportSettingsButton = document.getElementById('exportSettings');
  const importSettingsButton = document.getElementById('importSettings'); // the visible button
  const importFileInput = document.getElementById('importFile'); // the hidden file input
  const modelSelect = document.getElementById('modelSelect');

  if (saveApiKeyButton) {
    saveApiKeyButton.addEventListener('click', saveApiKey);
  }

  if (apiKeyInput) {
    apiKeyInput.addEventListener('change', () => saveApiKey());
  }

  if (addPromptButton) {
    addPromptButton.addEventListener('click', addNewPrompt);
  }

  if (savePromptsButton) {
    savePromptsButton.addEventListener('click', savePrompts);
  }

  if (exportSettingsButton) {
    exportSettingsButton.addEventListener('click', exportSettings);
  }

  if (importSettingsButton && importFileInput) {
    importSettingsButton.addEventListener('click', () => {
      importFileInput.click();
    });
    importFileInput.addEventListener('change', importSettings);
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', saveSelectedModel);
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
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});