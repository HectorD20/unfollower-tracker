const state = {
  followers: [],
  following: [],
  sources: { followers: [], following: [] },
  results: { unfollowers: [], notFollowing: [], mutual: [] }
};

const dropFolder = document.getElementById('drop-folder');
const folderInput = document.getElementById('folder-input');
const dropFollowers = document.getElementById('drop-followers');
const dropFollowing = document.getElementById('drop-following');
const analyzeBtn = document.getElementById('analyze-btn');
const uploadSection = document.getElementById('upload-section');
const resultsSection = document.getElementById('results-section');
const searchInput = document.getElementById('search-input');
const errorToast = document.getElementById('error-toast');

const zones = {
  followers: dropFollowers,
  following: dropFollowing
};

function showError(message) {
  errorToast.textContent = message;
  errorToast.classList.add('show');
  clearTimeout(showError._timer);
  showError._timer = setTimeout(() => errorToast.classList.remove('show'), 4000);
}

function classifyFile(filename) {
  const name = filename.split(/[/\\]/).pop().toLowerCase();
  if (/^followers(_\d+)?\.json$/.test(name)) return 'followers';
  if (/^following\d*\.json$/.test(name)) return 'following';
  return null;
}

function getUsernameFromEntry(entry) {
  const fromValue = entry?.string_list_data?.[0]?.value;
  if (fromValue) return fromValue.toLowerCase();

  const fromTitle = entry?.title?.trim();
  if (fromTitle) return fromTitle.toLowerCase();

  const href = entry?.string_list_data?.[0]?.href;
  if (href) {
    const match = href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i);
    if (match?.[1]) return match[1].toLowerCase();
  }

  return null;
}

function extractUsernames(data, type) {
  const usernames = [];
  let entries;

  if (type === 'followers') {
    if (!Array.isArray(data)) {
      throw new Error('followers_*.json debe ser un arreglo.');
    }
    entries = data;
  } else {
    entries = data?.relationships_following;
    if (!Array.isArray(entries)) {
      throw new Error('following*.json debe contener "relationships_following".');
    }
  }

  for (const entry of entries) {
    const username = getUsernameFromEntry(entry);
    if (username) usernames.push(username);
  }

  return usernames;
}

function mergeUnique(existing, incoming) {
  return [...new Set([...existing, ...incoming])];
}

function updateAnalyzeButton() {
  analyzeBtn.disabled = state.followers.length === 0 || state.following.length === 0;
}

function markZoneLoaded(zone, loaded) {
  zone.classList.toggle('loaded', loaded);
  zone.querySelector('.upload-icon').style.display = loaded ? 'none' : 'block';
  zone.querySelector('.check-icon').style.display = loaded ? 'block' : 'none';
}

function updateZoneUI(type) {
  const zone = zones[type];
  const filenameEl = document.getElementById(`${type}-filename`);
  const count = state[type].length;
  const sources = state.sources[type];

  if (count === 0) {
    markZoneLoaded(zone, false);
    filenameEl.textContent = '';
    return;
  }

  markZoneLoaded(zone, true);
  const fileList = sources.length <= 2
    ? sources.join(', ')
    : `${sources.slice(0, 2).join(', ')} +${sources.length - 2} más`;
  filenameEl.textContent = `${fileList} (${count} usuarios)`;
}

function applyUsernames(type, usernames, sourceLabel) {
  if (usernames.length === 0) return 0;

  state[type] = mergeUnique(state[type], usernames);
  if (sourceLabel && !state.sources[type].includes(sourceLabel)) {
    state.sources[type].push(sourceLabel);
  }

  updateZoneUI(type);
  updateAnalyzeButton();
  return usernames.length;
}

function parseJsonText(text, type) {
  const data = JSON.parse(text);
  const usernames = extractUsernames(data, type);
  if (usernames.length === 0) {
    throw new Error('No se encontraron usuarios en el contenido.');
  }
  return usernames;
}

async function readFileAsUsernames(file, type) {
  const text = await file.text();
  return parseJsonText(text, type);
}

async function processFileList(files, forcedType = null) {
  const jsonFiles = [...files].filter(f => f.name.toLowerCase().endsWith('.json'));
  if (jsonFiles.length === 0) {
    throw new Error('No se encontraron archivos JSON válidos.');
  }

  const results = { followers: 0, following: 0, skipped: 0 };

  for (const file of jsonFiles) {
    const type = forcedType || classifyFile(file.name);
    if (!type) {
      results.skipped++;
      continue;
    }

    try {
      const usernames = await readFileAsUsernames(file, type);
      const added = applyUsernames(type, usernames, file.name);
      results[type] += added;
    } catch (err) {
      showError(`${file.name}: ${err.message}`);
    }
  }

  return results;
}

async function traverseEntry(entry, files) {
  if (entry.isFile) {
    files.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const readEntries = () => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    let entries = await readEntries();
    while (entries.length > 0) {
      for (const child of entries) {
        await traverseEntry(child, files);
      }
      entries = await readEntries();
    }
  }
}

async function collectFilesFromDataTransfer(dataTransfer) {
  const files = [];
  const items = dataTransfer.items;

  if (items?.length) {
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        await traverseEntry(entry, files);
      } else {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  } else {
    files.push(...dataTransfer.files);
  }

  return files;
}

async function handleFolderFiles(files) {
  const results = await processFileList(files);

  if (results.followers === 0 && results.following === 0) {
    throw new Error('No se encontraron followers_*.json ni following*.json en la carpeta.');
  }

  const parts = [];
  if (results.followers > 0) parts.push(`${state.followers.length} seguidores`);
  if (results.following > 0) parts.push(`${state.following.length} seguidos`);

  markZoneLoaded(dropFolder, true);
  document.getElementById('folder-filename').textContent = parts.join(' · ');
}

function setupDropZone(zone) {
  const type = zone.dataset.type;
  const input = zone.querySelector('input[type="file"]');

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (!files.length) return;

    try {
      await processFileList(files, type);
    } catch (err) {
      showError(err.message);
    }
  });

  input.addEventListener('change', async () => {
    if (!input.files.length) return;
    try {
      await processFileList(input.files, type);
    } catch (err) {
      showError(err.message);
    }
  });
}

function setupFolderZone() {
  dropFolder.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropFolder.classList.add('drag-over');
  });

  dropFolder.addEventListener('dragleave', () => dropFolder.classList.remove('drag-over'));

  dropFolder.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropFolder.classList.remove('drag-over');
    try {
      const files = await collectFilesFromDataTransfer(e.dataTransfer);
      await handleFolderFiles(files);
    } catch (err) {
      showError(err.message);
    }
  });

  folderInput.addEventListener('change', async () => {
    if (!folderInput.files.length) return;
    try {
      await handleFolderFiles(folderInput.files);
    } catch (err) {
      showError(err.message);
    }
  });
}

function analyze() {
  const followersSet = new Set(state.followers);
  const followingSet = new Set(state.following);

  const unfollowers = [...followingSet].filter(u => !followersSet.has(u)).sort();
  const notFollowing = [...followersSet].filter(u => !followingSet.has(u)).sort();
  const mutual = [...followingSet].filter(u => followersSet.has(u)).sort();

  state.results = { unfollowers, notFollowing, mutual };
  renderResults();
}

function createUserItem(username) {
  const li = document.createElement('li');
  li.className = 'user-item';
  li.dataset.username = username;

  const name = document.createElement('span');
  name.className = 'username';
  name.textContent = `@${username}`;

  const link = document.createElement('a');
  link.className = 'profile-link';
  link.href = `https://instagram.com/${encodeURIComponent(username)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.innerHTML = `Ver perfil <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

  li.append(name, link);
  return li;
}

function renderList(listEl, users) {
  listEl.innerHTML = '';
  if (users.length === 0) {
    listEl.innerHTML = '<li class="empty-state">No hay usuarios en esta categoría.</li>';
    return;
  }
  const fragment = document.createDocumentFragment();
  users.forEach(u => fragment.appendChild(createUserItem(u)));
  listEl.appendChild(fragment);
}

function renderResults() {
  const { unfollowers, notFollowing, mutual } = state.results;

  document.getElementById('stat-unfollowers').textContent = unfollowers.length;
  document.getElementById('stat-not-following').textContent = notFollowing.length;
  document.getElementById('stat-mutual').textContent = mutual.length;

  document.getElementById('count-unfollowers').textContent = unfollowers.length;
  document.getElementById('count-not-following').textContent = notFollowing.length;
  document.getElementById('count-mutual').textContent = mutual.length;

  renderList(document.getElementById('list-unfollowers'), unfollowers);
  renderList(document.getElementById('list-not-following'), notFollowing);
  renderList(document.getElementById('list-mutual'), mutual);

  uploadSection.classList.add('compact');
  dropFolder.classList.add('compact');
  resultsSection.classList.add('visible');
  searchInput.value = '';
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetAll() {
  state.followers = [];
  state.following = [];
  state.sources = { followers: [], following: [] };
  state.results = { unfollowers: [], notFollowing: [], mutual: [] };

  [dropFollowers, dropFollowing].forEach(zone => {
    markZoneLoaded(zone, false);
    zone.querySelector('input').value = '';
  });

  markZoneLoaded(dropFolder, false);
  folderInput.value = '';
  document.getElementById('folder-filename').textContent = '';
  document.getElementById('followers-filename').textContent = '';
  document.getElementById('following-filename').textContent = '';
  document.getElementById('paste-followers').value = '';
  document.getElementById('paste-following').value = '';

  analyzeBtn.disabled = true;
  uploadSection.classList.remove('compact');
  dropFolder.classList.remove('compact');
  resultsSection.classList.remove('visible');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function init() {
  setupFolderZone();
  setupDropZone(dropFollowers);
  setupDropZone(dropFollowing);

  analyzeBtn.addEventListener('click', analyze);

  document.querySelectorAll('.paste-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const textarea = document.getElementById(`paste-${type}`);
      const text = textarea.value.trim();
      if (!text) {
        showError('Pega el contenido JSON antes de continuar.');
        return;
      }
      try {
        const usernames = parseJsonText(text, type);
        applyUsernames(type, usernames, 'pegado manualmente');
      } catch (err) {
        showError(err.message || 'JSON inválido.');
      }
    });
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');

      searchInput.dispatchEvent(new Event('input'));
    });
  });

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const activePanel = document.querySelector('.tab-panel.active');
    if (!activePanel) return;

    activePanel.querySelectorAll('.user-item').forEach(item => {
      const username = item.dataset.username || '';
      item.classList.toggle('hidden', query !== '' && !username.includes(query));
    });
  });

  document.getElementById('reset-btn').addEventListener('click', resetAll);
}

init();
