// 백준 문제 페이지에서 DOM 셀렉터로 정보 추출
// 알려진 셀렉터: #problem_title, #problem_description, #problem_input, #problem_output
// 샘플 입출력: pre#sample-input-1, pre#sample-output-1 등
// (여러 블로그/예제 기준)
function scrape() {
    const url = location.href;
    const number = (url.match(/\/problem\/(\d+)/) || [])[1] || '';
  
    const titleEl = document.querySelector('#problem_title') || document.querySelector('span#problem_title');
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(/^\s*\d+\s*-\s*/,'').trim();
  
    const getHtml = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      // p들이 여러 개일 수 있어 innerText로 묶어서
      return el.innerText.trim();
    }; 
  
    const description = getHtml('#problem_description') || '';
    const input = getHtml('#problem_input') || '';
    const output = getHtml('#problem_output') || '';
    const limit = getHtml('#problem_limit') || ''; //제한 사항 추가
  
    // 첫 번째 샘플만 미리
    const sampleInEl = document.querySelector('pre#sample-input-1, pre#sampleinput1, pre[id^="sample-input"]');
    const sampleOutEl = document.querySelector('pre#sample-output-1, pre#sampleoutput1, pre[id^="sample-output"]');
  
    const samples = [];
    if (sampleInEl || sampleOutEl) {
      samples.push({
        in: sampleInEl ? sampleInEl.innerText : '',
        out: sampleOutEl ? sampleOutEl.innerText : ''
      });
    }

    // Solved.ac 티어 정보 추출
    const tierEl = document.querySelector('span[class*="solvedac-tier-name-"]');
    let tier = null;
    if (tierEl) {
      const match = tierEl.className.match(/solvedac-tier-name-(\d+)/);
      if (match && match[1]) {
        tier = parseInt(match[1], 10);
      }
    }

    // 스포일러(알고리즘 분류) 태그 추출
    const tagEls = document.querySelectorAll('a.spoiler-link');
    const tags = Array.from(tagEls).map(el => el.textContent.trim());
  
    return {
      number,
      title,
      url,
      description,
      input,
      output,
      samples,
      limit,
      tier,
      tags
    };
  }
  
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'SCRAPE_BAEKJOON') {
      try {
        const problem = scrape();
        sendResponse({ problem });
      } catch (e) {
        sendResponse({ problem: null, error: e.message });
      }
    }
    // async 응답 허용 X
    return true;
  });
  