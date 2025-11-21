let cachedProblem = null;

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById('grab').addEventListener('click', async () => {
  const tab = await getCurrentTab();
  // content-script로 데이터 요청
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_BAEKJOON' });
    cachedProblem = res?.problem || null;
    const preview = document.getElementById('preview');
    if (cachedProblem) {
      preview.innerHTML = `
        <b>${cachedProblem.number}</b> - ${cachedProblem.title}<br/>
        <small>${cachedProblem.url}</small>
        <hr/>
        <div><b>설명</b><br/>${cachedProblem.description.slice(0, 500)}${cachedProblem.description.length>500?'...':''}</div>
        <div><b>예시 입력</b><br/>${cachedProblem.input.slice(0, 300)}${cachedProblem.input.length>300?'...':''}</div>
        <div><b>예시 출력</b><br/>${cachedProblem.output.slice(0, 300)}${cachedProblem.output.length>300?'...':''}</div>
      `;
      document.getElementById('create').disabled = false;
    } else {
      preview.textContent = '이 페이지에서 문제 정보를 찾지 못했습니다.';
    }
  } catch (e) {
    document.getElementById('preview').textContent = 'content-script 통신 실패: ' + e.message;
  }
});

document.getElementById('create').addEventListener('click', async () => {
  if (!cachedProblem) return;
  const resp = await chrome.runtime.sendMessage({ type: 'CREATE_JIRA_ISSUE', problem: cachedProblem });
  const preview = document.getElementById('preview');
  if (resp?.ok) {
    // 새 탭으로 이슈 페이지 열기
    chrome.tabs.create({ url: resp.url });
    if (resp.existed) {
      preview.innerHTML += `<hr/><b>이미 존재하는 이슈:</b> <a href="${resp.url}" target="_blank">${resp.key}</a>`;
    } else {
      preview.innerHTML += `<hr/><b>생성 완료:</b> <a href="${resp.url}" target="_blank">${resp.key}</a>`;
    }
  } else {
    preview.innerHTML += `<hr/><b>실패:</b> ${resp?.error || '알 수 없는 오류'}`;
  }
});
