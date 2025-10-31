async function getConfig() {
    const cfg = await chrome.storage.sync.get({
      jiraBaseUrl: '',
      jiraVersion: 'dc',
      projectKey: '',
      issueTypeName: 'Task',
      authUser: '',
      authToken: '',
      customFieldId: '',
      defaultLabels: 'baekjoon'
    });
    return cfg;
  }
  
  function buildIssuePayload(cfg, problem) {
    const summary = `[BOJ ${problem.number}] ${problem.title}`;
    const descriptionLines = [
      `* *문제 링크*: ${problem.url}`,
      '',
      'h2. *설명*',
      problem.description || '(없음)',
      '',
      'h2. *입력*',
      problem.input || '(없음)',
      '',
      'h2. *출력*',
      problem.output || '(없음)',
    ];
    if (problem.samples?.length) {
      const s = problem.samples[0];
      descriptionLines.push('', '*샘플 입력 1*', '{code:none}', s.in || '', '{code}', '', '*샘플 출력 1*', '{code:none}', s.out || '', '{code}');
    }
  
    const fields = {
      project: { key: cfg.projectKey },
      summary,
      issuetype: { name: cfg.issueTypeName },
      labels: (cfg.defaultLabels || 'baekjoon').split(',').map(s => s.trim()).filter(Boolean),
      description: descriptionLines.join('\n')
    };
  
    // 커스텀 필드에 문제번호 저장 (선택)
    if (cfg.customFieldId) {
      fields[cfg.customFieldId] = problem.number || '';
    }
  
    return { fields };
  }
  
  async function createIssue(cfg, problem) {
    if (!cfg.jiraBaseUrl || !cfg.projectKey || !cfg.issueTypeName || !cfg.authToken) { //[CX-5] !cfg.authUser 제외, PAT 사용으로 불필요
      throw new Error('설정이 불완전합니다. 옵션 페이지에서 Jira 연결 정보를 채워주세요.');
    }
  
    const endpoint = cfg.jiraVersion === 'cloud'
      ? `${cfg.jiraBaseUrl}/rest/api/3/issue` //클라우드
      : `${cfg.jiraBaseUrl}/rest/api/2/issue`; //데이터센터
  
    const body = buildIssuePayload(cfg, problem);
    // Basic Auth (Cloud는 email:APITOKEN) / DC는 ID: 토큰
    const authHeader = 'Bearer ' + '${cfg.authToken}';
  
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API 오류 (${res.status}): ${text}`);
    }
  
    const data = await res.json();
    // Cloud/DC 모두 응답에 key/self 등이 포함됨
    return { key: data.key, url: data.self?.replace('/rest/api/2/issue/', '/browse/').replace('/rest/api/3/issue/', '/browse/') || `${cfg.jiraBaseUrl}/browse/${data.key}` };
  }
  
  chrome.runtime.onInstalled.addListener(() => {
    // 컨텍스트 메뉴: 백준 문제 페이지에서만 보이도록
    chrome.contextMenus.create({
      id: 'create-jira-from-boj',
      title: '이 문제를 Jira 이슈로 만들기',
      contexts: ['page'],
      documentUrlPatterns: ['https://www.acmicpc.net/problem/*']
    });
  });
  
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'create-jira-from-boj') {
      // content-script로 파싱 요청
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_BAEKJOON' });
      const cfg = await getConfig();
      try {
        const out = await createIssue(cfg, res.problem);
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'Jira 이슈 생성 완료',
          message: `${out.key}`
        });
      } catch (e) {
        console.error(e);
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'Jira 이슈 생성 실패',
          message: e.message
        });
      }
    }
  });
  
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === 'CREATE_JIRA_ISSUE') {
        try {
          const cfg = await getConfig();
          const out = await createIssue(cfg, msg.problem);
          sendResponse({ ok: true, key: out.key, url: out.url });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      }
    })();
    return true; // async
  });
  