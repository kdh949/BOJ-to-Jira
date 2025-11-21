const els = {
    jiraBaseUrl: document.getElementById('jiraBaseUrl'),
    jiraVersion: document.getElementById('jiraVersion'),
    projectKey: document.getElementById('projectKey'),
    issueTypeName: document.getElementById('issueTypeName'),
    authUser: document.getElementById('authUser'),
    authToken: document.getElementById('authToken'),
    customFieldId: document.getElementById('customFieldId'),
    defaultLabels: document.getElementById('defaultLabels'),
    save: document.getElementById('save'),
    status: document.getElementById('status'),
    customFieldId_Level: document.getElementById('customFieldId_Level')
  };
  
  (async function init() {
    const cfg = await chrome.storage.sync.get({
      jiraBaseUrl: '',
      jiraVersion: 'dc',
      projectKey: '',
      issueTypeName: 'Task',
      authUser: '',
      authToken: '',
      customFieldId: '',
      defaultLabels: 'baekjoon',
      customFieldId_Level: ''
    });
    Object.keys(cfg).forEach(k => {
      if (els[k]) els[k].value = cfg[k];
    });
  })();
  
  els.save.addEventListener('click', async () => {
    const payload = {
      jiraBaseUrl: els.jiraBaseUrl.value.trim().replace(/\/+$/,''),
      jiraVersion: els.jiraVersion.value,
      projectKey: els.projectKey.value.trim(),
      issueTypeName: els.issueTypeName.value.trim(),
      authUser: els.authUser.value.trim(),
      authToken: els.authToken.value,
      customFieldId: els.customFieldId.value.trim(),
      defaultLabels: els.defaultLabels.value.trim(),
      customFieldId_Level: els.customFieldId_Level.value.trim()
    };
    await chrome.storage.sync.set(payload);
    els.status.textContent = '저장됨';
    setTimeout(() => els.status.textContent = '', 1200);
  });
  