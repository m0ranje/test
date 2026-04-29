const storageKeys = {
  participantId: 'qrTestParticipantId',
  completed: 'qrTestCompleted'
};

function getCookie(name) {
  const item = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.split('=').slice(1).join('=')) : '';
}

function setCookie(name, value, days = 365) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
}

function getParticipantId() {
  const saved = localStorage.getItem(storageKeys.participantId) || getCookie(storageKeys.participantId);
  if (saved) {
    return saved;
  }

  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const participantId = `user_${random.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  localStorage.setItem(storageKeys.participantId, participantId);
  setCookie(storageKeys.participantId, participantId);
  return participantId;
}

function markCompleted() {
  localStorage.setItem(storageKeys.completed, 'true');
  setCookie(storageKeys.completed, 'true');
}

function hasCompleted() {
  return localStorage.getItem(storageKeys.completed) === 'true' || getCookie(storageKeys.completed) === 'true';
}

function showMessage(element, text, isError = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('error', isError);
  element.classList.add('show');
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message = data && data.message ? data.message : 'Ошибка запроса';
    throw new Error(message);
  }

  return data;
}

function renderAdminNav(active = '') {
  const nav = document.querySelector('[data-admin-nav]');
  if (!nav) return;

  const items = [
    ['Панель', '/admin', 'home'],
    ['Вопросы', '/admin/questions', 'questions'],
    ['Статистика', '/admin/statistics', 'statistics'],
    ['QR-code', '/admin/qr', 'qr']
  ];

  nav.innerHTML = items
    .map(([label, href, key]) => `<a href="${href}" ${active === key ? 'style="border-color: rgba(0, 0, 0, 0.92); color: #ffffff; background: #000000;"' : ''}>${label}</a>`)
    .join('') + '<button class="ghost-button" type="button" data-logout>Выйти</button>';

  nav.querySelector('[data-logout]').addEventListener('click', async () => {
    await apiFetch('/api/admin/logout', { method: 'POST', body: '{}' });
    location.href = '/admin/login';
  });
}

async function initHome() {
  const title = document.querySelector('[data-test-title]');
  const status = document.querySelector('[data-test-status]');
  const qrImage = document.querySelector('[data-home-qr-image]');
  const qrUrl = document.querySelector('[data-home-qr-url]');
  if (!title && !status && !qrImage) return;

  try {
    const data = await apiFetch('/api/questions');
    if (title) title.textContent = data.settings.testTitle;
    if (status) {
      status.textContent = data.settings.testEnabled ? 'Тест включён' : 'Тест выключен';
      status.classList.toggle('off', !data.settings.testEnabled);
    }

    if (qrImage) {
      const qr = await apiFetch('/api/qr');
      qrImage.src = qr.qrDataUrl;
      qrImage.alt = `QR-code для ${qr.testUrl}`;
      if (qrUrl) qrUrl.textContent = qr.testUrl;
    }
  } catch {
    if (status) {
      status.textContent = 'Сервер недоступен';
      status.classList.add('off');
    }
  }
}

async function initTest() {
  const form = document.querySelector('[data-test-form]');
  const list = document.querySelector('[data-question-list]');
  const submit = document.querySelector('[data-submit-test]');
  const message = document.querySelector('[data-message]');
  const title = document.querySelector('[data-page-title]');
  if (!form || !list) return;

  if (hasCompleted()) {
    form.style.display = 'none';
    showMessage(message, 'Вы уже проходили этот тест');
    return;
  }

  try {
    const data = await apiFetch('/api/questions');
    if (title) title.textContent = data.settings.testTitle;

    if (!data.settings.testEnabled) {
      form.style.display = 'none';
      showMessage(message, 'Тест сейчас выключен', true);
      return;
    }

    list.innerHTML = data.questions
      .map((question, index) => `
        <article class="card question-card" style="animation-delay: ${index * 0.04}s">
          <div class="card-body">
            <p class="question-title">${index + 1}. ${escapeHtml(question.text)}</p>
            <div class="answer-list">
              ${question.answers.map(answer => `
                <label class="answer-option">
                  <input type="radio" name="question_${question.id}" value="${escapeHtml(answer.id)}" required>
                  <span>${escapeHtml(answer.text)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </article>
      `)
      .join('');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Сохранение...';

      const participantName = form.participantName.value.trim();
      if (participantName.length < 2) {
        submit.disabled = false;
        submit.textContent = 'Отправить ответы';
        showMessage(message, 'Введите ваше имя', true);
        return;
      }

      const answers = data.questions.map(question => {
        const checked = form.querySelector(`input[name="question_${question.id}"]:checked`);
        return {
          questionId: question.id,
          answerId: checked ? checked.value : ''
        };
      });

      if (answers.some(answer => !answer.answerId)) {
        submit.disabled = false;
        submit.textContent = 'Отправить ответы';
        showMessage(message, 'Ответьте на все вопросы', true);
        return;
      }

      try {
        const result = await apiFetch('/api/submit', {
          method: 'POST',
          body: JSON.stringify({
            participantId: getParticipantId(),
            participantName,
            answers
          })
        });
        markCompleted();
        form.style.display = 'none';
        showMessage(message, result.message || 'Спасибо, ваш ответ сохранён');
      } catch (error) {
        if (error.message.includes('уже проходили')) {
          markCompleted();
          form.style.display = 'none';
        } else {
          submit.disabled = false;
          submit.textContent = 'Отправить ответы';
        }
        showMessage(message, error.message, true);
      }
    });
  } catch (error) {
    form.style.display = 'none';
    showMessage(message, error.message, true);
  }
}

async function initLogin() {
  const form = document.querySelector('[data-login-form]');
  const message = document.querySelector('[data-message]');
  if (!form) return;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      username: form.username.value.trim(),
      password: form.password.value
    };

    try {
      await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      location.href = '/admin';
    } catch (error) {
      showMessage(message, error.message, true);
    }
  });
}

async function initDashboard() {
  const root = document.querySelector('[data-dashboard]');
  if (!root) return;
  renderAdminNav('home');

  try {
    const data = await apiFetch('/api/statistics');
    const stats = data.statistics;
    document.querySelector('[data-participants]').textContent = data.participantsCount;
    document.querySelector('[data-questions-count]').textContent = stats.questions.length;
    const status = document.querySelector('[data-status]');
    status.textContent = data.settings.testEnabled ? '✓' : '×';
    status.setAttribute('aria-label', data.settings.testEnabled ? 'Тест работает' : 'Тест выключен');
    status.title = data.settings.testEnabled ? 'Тест работает' : 'Тест выключен';
    status.classList.toggle('off', !data.settings.testEnabled);
    document.querySelector('[data-test-url]').textContent = data.settings.testUrl;

    const dashboardQr = document.querySelector('[data-dashboard-qr-image]');
    if (dashboardQr) {
      const qr = await apiFetch('/api/admin/qr');
      dashboardQr.src = qr.qrDataUrl;
      dashboardQr.alt = `QR-code для ${qr.testUrl}`;
    }

    document.querySelector('[data-toggle-test]').addEventListener('click', async () => {
      await apiFetch('/api/admin/toggle-test', { method: 'POST', body: '{}' });
      location.reload();
    });

    document.querySelector('[data-clear-results]').addEventListener('click', async () => {
      if (!confirm('Очистить все результаты и участников?')) return;
      await apiFetch('/api/admin/clear-results', { method: 'POST', body: '{}' });
      location.reload();
    });
  } catch (error) {
    if (error.message.includes('администратора')) location.href = '/admin/login';
  }
}

async function initQuestionsEditor() {
  const form = document.querySelector('[data-questions-form]');
  const list = document.querySelector('[data-editor-list]');
  const message = document.querySelector('[data-message]');
  if (!form || !list) return;
  renderAdminNav('questions');

  try {
    const data = await apiFetch('/api/questions');
    list.innerHTML = data.questions.map((question, index) => renderQuestionEditor(question, index)).join('');

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const questions = [...list.querySelectorAll('[data-editor-question]')].map((card, index) => ({
        id: index + 1,
        text: card.querySelector('[data-question-text]').value.trim(),
        answers: [...card.querySelectorAll('[data-answer-row]')].map(row => ({
          id: row.querySelector('[data-answer-id]').value.trim(),
          text: row.querySelector('[data-answer-text]').value.trim()
        }))
      }));

      try {
        await apiFetch('/api/admin/questions', {
          method: 'POST',
          body: JSON.stringify({ questions })
        });
        showMessage(message, 'Вопросы сохранены');
      } catch (error) {
        showMessage(message, error.message, true);
      }
    });
  } catch (error) {
    if (error.message.includes('администратора')) location.href = '/admin/login';
    showMessage(message, error.message, true);
  }
}

function renderQuestionEditor(question, index) {
  const answers = [...question.answers];
  while (answers.length < 4) {
    answers.push({ id: String.fromCharCode(97 + answers.length), text: '' });
  }

  return `
    <article class="card" data-editor-question>
      <div class="card-body form">
        <div class="field">
          <label>Вопрос ${index + 1}</label>
          <textarea class="textarea" data-question-text required>${escapeHtml(question.text)}</textarea>
        </div>
        ${answers.map(answer => `
          <div class="answer-editor" data-answer-row>
            <input class="input" data-answer-id value="${escapeHtml(answer.id)}" maxlength="1" required>
            <input class="input" data-answer-text value="${escapeHtml(answer.text)}" placeholder="Вариант ответа" ${answer.text ? 'required' : ''}>
          </div>
        `).join('')}
        <p class="muted">Можно оставить лишние варианты пустыми, если нужны только ответы «Да» и «Нет».</p>
      </div>
    </article>
  `;
}

async function initStatistics() {
  const list = document.querySelector('[data-stat-list]');
  const total = document.querySelector('[data-total-participants]');
  if (!list) return;
  renderAdminNav('statistics');

  try {
    const data = await apiFetch('/api/statistics');
    total.textContent = data.statistics.totalParticipants;

    if (data.statistics.questions.length === 0) {
      list.innerHTML = '<div class="empty-state">Вопросов пока нет</div>';
      return;
    }

    list.innerHTML = data.statistics.questions.map((question, index) => `
      <article class="card">
        <div class="card-body">
          <h3>${index + 1}. ${escapeHtml(question.text)}</h3>
          <div class="stat-lines">
            ${question.variants.map(variant => `
              <div class="stat-row">
                <div class="stat-line">
                  <span>${escapeHtml(variant.text)}</span>
                  <strong>${variant.count} чел., ${variant.percent}%</strong>
                </div>
                <div class="stat-bar ${getAnswerToneClass(variant.text)}" aria-hidden="true">
                  <span style="width: ${Math.max(variant.percent, variant.count > 0 ? 4 : 0)}%"></span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="chart-wrap">
            <canvas id="chart_${question.id}"></canvas>
          </div>
        </div>
      </article>
    `).join('');

    data.statistics.questions.forEach(question => {
      const canvas = document.getElementById(`chart_${question.id}`);
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: question.variants.map(item => item.text),
          datasets: [{
            label: 'Ответы',
            data: question.variants.map(item => item.count),
            backgroundColor: question.variants.map(item => getAnswerColor(item.text)),
            borderColor: question.variants.map(item => getAnswerBorderColor(item.text)),
            borderWidth: 1,
            borderRadius: 0,
            barPercentage: 0.58,
            categoryPercentage: 0.7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: context => {
                  const variant = question.variants[context.dataIndex];
                  return `${variant.count} чел., ${variant.percent}%`;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#000000' },
              grid: { color: 'rgba(0, 0, 0, 0.12)' }
            },
            y: {
              beginAtZero: true,
              suggestedMax: Math.max(1, ...question.variants.map(item => item.count)),
              ticks: { color: '#000000', precision: 0 },
              grid: { color: 'rgba(0, 0, 0, 0.14)' }
            }
          }
        }
      });
    });
  } catch (error) {
    if (error.message.includes('администратора')) location.href = '/admin/login';
  }
}

function getAnswerToneClass(text) {
  const normalized = String(text).trim().toLowerCase();
  if (normalized === 'да') return 'yes';
  if (normalized === 'нет') return 'no';
  return '';
}

function getAnswerColor(text) {
  const normalized = String(text).trim().toLowerCase();
  if (normalized === 'да') return '#16a34a';
  if (normalized === 'нет') return '#dc2626';
  return '#737373';
}

function getAnswerBorderColor(text) {
  const normalized = String(text).trim().toLowerCase();
  if (normalized === 'да') return '#166534';
  if (normalized === 'нет') return '#991b1b';
  return '#000000';
}

async function initQr() {
  const image = document.querySelector('[data-qr-image]');
  const url = document.querySelector('[data-qr-url]');
  if (!image || !url) return;
  renderAdminNav('qr');

  try {
    const data = await apiFetch('/api/admin/qr');
    image.src = data.qrDataUrl;
    url.textContent = data.testUrl;
    image.alt = `QR-code для ${data.testUrl}`;
  } catch (error) {
    if (error.message.includes('администратора')) location.href = '/admin/login';
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  initHome();
  initTest();
  initLogin();
  initDashboard();
  initQuestionsEditor();
  initStatistics();
  initQr();
});
