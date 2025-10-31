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
    ];
    if (problem.tier) {
      descriptionLines.push(`* *난이도*: Solved.ac Tier ${problem.tier}`);
    }
    descriptionLines.push(
      '',
      'h2. *설명*',
      problem.description || '(없음)',
      '',
      'h2. *입력*',
      problem.input || '(없음)',
      '',
      'h2. *출력*',
      problem.output || '(없음)',
      '',
      'h2. *제한*',
      problem.limit || '(없음)',
    );
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
    const endpoint = cfg.jiraVersion === 'cloud'
      ? `${cfg.jiraBaseUrl}/rest/api/3/issue` //클라우드
      : `${cfg.jiraBaseUrl}/rest/api/2/issue`; //데이터센터
  
    const body = buildIssuePayload(cfg, problem);
    let authHeader;
    if (cfg.jiraVersion === 'dc') {
      authHeader = `Bearer ${cfg.authToken}`; // DC는 PAT (Bearer 토큰) 사용
    } else {
      authHeader = 'Basic ' + btoa(`${cfg.authUser}:${cfg.authToken}`); // Cloud는 email:APIToken (Basic)
    }
  
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
    return { key: data.key, url: `${cfg.jiraBaseUrl}/browse/${data.key}` };
  }
  
  async function searchIssueByProblemNumber(cfg, problemNumber) {
    const endpoint = cfg.jiraVersion === 'cloud'
      ? `${cfg.jiraBaseUrl}/rest/api/3/search`
      : `${cfg.jiraBaseUrl}/rest/api/2/search`;
  
    // JQL 쿼리: project, issuetype, 그리고 문제 번호가 저장된 커스텀 필드를 기준으로 검색
    const jql = `project = "${cfg.projectKey}" AND issuetype = "${cfg.issueTypeName}" AND cf[10402] ~ "${problemNumber}" ORDER BY created DESC`;
  
    let authHeader;
    if (cfg.jiraVersion === 'dc') {
      authHeader = `Bearer ${cfg.authToken}`;
    } else {
      authHeader = 'Basic ' + btoa(`${cfg.authUser}:${cfg.authToken}`);
    }
  
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ jql, maxResults: 1, fields: ["key"] })
    });
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira 검색 API 오류 (${res.status}): ${text}`);
    }
  
    const data = await res.json();
    if (data.issues && data.issues.length > 0) {
      const issue = data.issues[0];
      return { 
        key: issue.key, 
        url: `${cfg.jiraBaseUrl}/browse/${issue.key}`,
        existed: true 
      };
    }
    return null; // 찾지 못함
  }
  
  async function findOrCreateIssue(cfg, problem) {
    if (!cfg.jiraBaseUrl || !cfg.projectKey || !cfg.issueTypeName || !cfg.authToken) {
      throw new Error('설정이 불완전합니다. 옵션 페이지에서 Jira 연결 정보를 채워주세요.');
    }
    // 중복 이슈를 찾으려면 '문제 번호 커스텀 필드'가 반드시 설정되어 있어야 함
    if (cfg.customFieldId && problem.number) {
      const existingIssue = await searchIssueByProblemNumber(cfg, problem.number);
      if (existingIssue) {
        return existingIssue; // 찾았으면 기존 이슈 정보 반환
      }
    }
    // 기존 이슈가 없거나, 검색할 수 없는 조건이면 새로 생성
    const newIssue = await createIssue(cfg, problem);
    return { ...newIssue, existed: false };
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
        const out = await findOrCreateIssue(cfg, res.problem);
        // 새 탭으로 이슈 페이지 열기
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: out.existed ? 'Jira 이슈 찾음' : 'Jira 이슈 생성 완료',
          message: `${out.key} 이슈를 새 탭으로 엽니다.`
        });
        chrome.tabs.create({ url: out.url });

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
          const out = await findOrCreateIssue(cfg, msg.problem);
          sendResponse({ ok: true, key: out.key, url: out.url, existed: out.existed });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      }
    })();
    return true; // async
  });
  