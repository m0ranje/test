const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs/promises');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');

const files = {
  questions: path.join(DATA_DIR, 'questions.json'),
  results: path.join(DATA_DIR, 'results.json'),
  participants: path.join(DATA_DIR, 'participants.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  admin: path.join(DATA_DIR, 'admin.json')
};

const defaultQuestions = [
  {
    id: 1,
    text: 'Вы нравитесь детям?',
    answers: [
      { id: 'a', text: 'Да' },
      { id: 'b', text: 'Нет' }
    ]
  },
  {
    id: 2,
    text: 'Вам нравится заниматься спортом и вести активный образ жизни?',
    answers: [
      { id: 'a', text: 'Да' },
      { id: 'b', text: 'Нет' }
    ]
  },
  {
    id: 3,
    text: 'Хотели бы вы научиться объяснять другим как правильно выполнять физические упражнения?',
    answers: [
      { id: 'a', text: 'Да' },
      { id: 'b', text: 'Нет' }
    ]
  },
  {
    id: 4,
    text: 'Готов(а) ли вы работать с людьми разного возраста, уровня подготовки и состояния здоровья?',
    answers: [
      { id: 'a', text: 'Да' },
      { id: 'b', text: 'Нет' }
    ]
  },
  {
    id: 5,
    text: 'Важно ли чтобы профессия приносила пользу людям?',
    answers: [
      { id: 'a', text: 'Да' },
      { id: 'b', text: 'Нет' }
    ]
  }
];

const defaultSettings = {
  testEnabled: true,
  testTitle: 'Тестирование',
  testUrl: `http://localhost:${PORT}/test`
};

const defaultAdmin = {
  username: 'admin',
  password: 'admin123'
};

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'qr-json-test-local-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(express.static(PUBLIC_DIR));

app.get('/vendor/chart.js', (req, res) => {
  res.sendFile(path.join(ROOT, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'));
});

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureJson(files.questions, defaultQuestions);
  await ensureJson(files.results, []);
  await ensureJson(files.participants, []);
  await ensureJson(files.settings, defaultSettings);
  await ensureJson(files.admin, defaultAdmin);
}

async function ensureJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    JSON.parse(raw);
  } catch {
    await writeJson(filePath, fallback);
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    await writeJson(filePath, fallback);
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function page(name) {
  return path.join(PUBLIC_DIR, name);
}

function sendPage(name) {
  return (req, res, next) => {
    res.sendFile(page(name), error => {
      if (!error) {
        return;
      }

      console.error(`Не удалось отдать страницу ${name}:`, error.message);
      next(error);
    });
  };
}

function isAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(401).json({ ok: false, message: 'Требуется вход администратора' });
}

function isAdminPage(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.redirect('/admin/login');
}

function nowLocal() {
  const date = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || 'unknown';
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/$/, '');
  }

  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${protocol}://${req.get('host')}`;
}

function getTestUrl(req, settings) {
  const savedUrl = String(settings.testUrl || '').trim();
  const shouldUseRequestHost =
    !savedUrl ||
    savedUrl.includes('localhost') ||
    savedUrl.includes('127.0.0.1') ||
    savedUrl.includes('0.0.0.0');

  return shouldUseRequestHost ? `${getBaseUrl(req)}/test` : savedUrl;
}

function normalizeQuestions(input) {
  if (!Array.isArray(input) || input.length !== 5) {
    throw new Error('Должно быть ровно 5 вопросов');
  }

  return input.map((question, index) => {
    const text = String(question.text || '').trim();
    const answers = Array.isArray(question.answers) ? question.answers : [];

    if (!text) {
      throw new Error(`Вопрос ${index + 1}: текст не может быть пустым`);
    }

    const cleanAnswers = answers
      .map((answer, answerIndex) => ({
        id: String(answer.id || String.fromCharCode(97 + answerIndex)).trim(),
        text: String(answer.text || '').trim()
      }))
      .filter(answer => answer.id && answer.text);

    if (cleanAnswers.length < 2 || cleanAnswers.length > 4) {
      throw new Error(`Вопрос ${index + 1}: нужно от 2 до 4 вариантов ответа`);
    }

    const ids = new Set(cleanAnswers.map(answer => answer.id));
    if (ids.size !== cleanAnswers.length) {
      throw new Error(`Вопрос ${index + 1}: ID вариантов не должны повторяться`);
    }

    return {
      id: index + 1,
      text,
      answers: cleanAnswers
    };
  });
}

function validateSubmittedAnswers(questions, submittedAnswers) {
  if (!Array.isArray(submittedAnswers) || submittedAnswers.length !== questions.length) {
    return false;
  }

  return questions.every(question => {
    const answer = submittedAnswers.find(item => Number(item.questionId) === Number(question.id));
    return answer && question.answers.some(option => option.id === answer.answerId);
  });
}

function buildStatistics(questions, results) {
  const totalParticipants = results.length;

  const questionsStats = questions.map(question => {
    const variants = question.answers.map(answer => {
      const count = results.filter(result =>
        Array.isArray(result.answers) &&
        result.answers.some(item => Number(item.questionId) === Number(question.id) && item.answerId === answer.id)
      ).length;

      return {
        id: answer.id,
        text: answer.text,
        count,
        percent: totalParticipants > 0 ? Math.round((count / totalParticipants) * 1000) / 10 : 0
      };
    });

    return {
      id: question.id,
      text: question.text,
      totalAnswers: variants.reduce((sum, item) => sum + item.count, 0),
      variants
    };
  });

  return { totalParticipants, questions: questionsStats };
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

app.get('/health', async (req, res) => {
  let publicFiles = [];
  let indexExists = false;

  try {
    publicFiles = await fs.readdir(PUBLIC_DIR);
    indexExists = publicFiles.includes('index.html');
  } catch (error) {
    publicFiles = [`Ошибка чтения public: ${error.message}`];
  }

  res.json({
    ok: true,
    app: 'qr-testing-json',
    root: ROOT,
    publicDir: PUBLIC_DIR,
    indexExists,
    publicFiles,
    testUrl: `${getBaseUrl(req)}/test`
  });
});

app.get('/', sendPage('index.html'));
app.get('/test', sendPage('test.html'));
app.get('/admin/login', sendPage('admin-login.html'));
app.get('/admin', isAdminPage, sendPage('admin.html'));
app.get('/admin/questions', isAdminPage, sendPage('admin-questions.html'));
app.get('/admin/statistics', isAdminPage, sendPage('admin-statistics.html'));
app.get('/admin/qr', isAdminPage, sendPage('admin-qr.html'));

app.post('/api/admin/login', async (req, res) => {
  const admin = await readJson(files.admin, defaultAdmin);
  const username = String(req.body.username || '');
  const password = String(req.body.password || '');

  if (username === admin.username && password === admin.password) {
    req.session.admin = { username };
    return res.json({ ok: true });
  }

  return res.status(401).json({ ok: false, message: 'Неверный логин или пароль' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ ok: true, isAdmin: Boolean(req.session && req.session.admin) });
});

app.get('/api/questions', async (req, res) => {
  const [questions, settings] = await Promise.all([
    readJson(files.questions, defaultQuestions),
    readJson(files.settings, defaultSettings)
  ]);

  res.json({
    ok: true,
    questions,
    settings: {
      testEnabled: settings.testEnabled,
      testTitle: settings.testTitle
    }
  });
});

app.get('/api/settings', async (req, res) => {
  const settings = await readJson(files.settings, defaultSettings);
  res.json({ ok: true, settings: { ...settings, testUrl: getTestUrl(req, settings) } });
});

app.get('/api/qr', async (req, res) => {
  const settings = await readJson(files.settings, defaultSettings);
  const testUrl = getTestUrl(req, settings);
  const qrDataUrl = await QRCode.toDataURL(testUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  res.json({ ok: true, testUrl, qrDataUrl });
});

app.post('/api/submit', async (req, res) => {
  const [questions, settings, participants, results] = await Promise.all([
    readJson(files.questions, defaultQuestions),
    readJson(files.settings, defaultSettings),
    readJson(files.participants, []),
    readJson(files.results, [])
  ]);

  if (!settings.testEnabled) {
    return res.status(403).json({ ok: false, message: 'Тест сейчас выключен' });
  }

  const participantId = String(req.body.participantId || '').trim();
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const ip = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || 'unknown');

  if (!/^user_[a-zA-Z0-9_-]{8,80}$/.test(participantId)) {
    return res.status(400).json({ ok: false, message: 'Не удалось определить участника' });
  }

  if (!validateSubmittedAnswers(questions, answers)) {
    return res.status(400).json({ ok: false, message: 'Ответьте на все вопросы' });
  }

  const alreadyById = participants.some(item => item.participantId === participantId);
  const alreadyByDevice = participants.some(item => item.ip === ip && item.userAgent === userAgent);

  if (alreadyById || alreadyByDevice) {
    return res.status(409).json({ ok: false, message: 'Вы уже проходили этот тест' });
  }

  const date = nowLocal();
  const participant = { participantId, ip, userAgent, date };
  const result = {
    participantId,
    date,
    answers: questions.map(question => {
      const answer = answers.find(item => Number(item.questionId) === Number(question.id));
      return {
        questionId: question.id,
        answerId: answer.answerId
      };
    })
  };

  participants.push(participant);
  results.push(result);

  await Promise.all([
    writeJson(files.participants, participants),
    writeJson(files.results, results)
  ]);

  return res.json({ ok: true, message: 'Спасибо, ваш ответ сохранён' });
});

app.get('/api/statistics', isAdmin, async (req, res) => {
  const [questions, results, participants, settings] = await Promise.all([
    readJson(files.questions, defaultQuestions),
    readJson(files.results, []),
    readJson(files.participants, []),
    readJson(files.settings, defaultSettings)
  ]);

  res.json({
    ok: true,
    statistics: buildStatistics(questions, results),
    participantsCount: participants.length,
    settings: { ...settings, testUrl: getTestUrl(req, settings) }
  });
});

app.post('/api/admin/questions', isAdmin, async (req, res) => {
  try {
    const questions = normalizeQuestions(req.body.questions);
    await writeJson(files.questions, questions);
    return res.json({ ok: true, questions });
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message });
  }
});

app.post('/api/admin/clear-results', isAdmin, async (req, res) => {
  await Promise.all([
    writeJson(files.results, []),
    writeJson(files.participants, [])
  ]);
  res.json({ ok: true, message: 'Результаты очищены' });
});

app.post('/api/admin/toggle-test', isAdmin, async (req, res) => {
  const settings = await readJson(files.settings, defaultSettings);
  settings.testEnabled = !settings.testEnabled;
  await writeJson(files.settings, settings);
  res.json({ ok: true, settings });
});

app.get('/api/admin/qr', isAdmin, async (req, res) => {
  const settings = await readJson(files.settings, defaultSettings);
  const testUrl = getTestUrl(req, settings);
  const qrDataUrl = await QRCode.toDataURL(testUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  res.json({ ok: true, testUrl, qrDataUrl });
});

app.get('/api/export-csv', isAdmin, async (req, res) => {
  const [questions, results, participants] = await Promise.all([
    readJson(files.questions, defaultQuestions),
    readJson(files.results, []),
    readJson(files.participants, [])
  ]);

  const participantMap = new Map(participants.map(item => [item.participantId, item]));
  const header = ['participantId', 'date', 'ip', 'userAgent', ...questions.map(question => `Вопрос ${question.id}`)];
  const rows = [header.map(escapeCsv).join(',')];

  for (const result of results) {
    const participant = participantMap.get(result.participantId) || {};
    const row = [
      result.participantId,
      result.date,
      participant.ip || '',
      participant.userAgent || ''
    ];

    for (const question of questions) {
      const savedAnswer = result.answers.find(item => Number(item.questionId) === Number(question.id));
      const answer = question.answers.find(item => savedAnswer && item.id === savedAnswer.answerId);
      row.push(answer ? answer.text : '');
    }

    rows.push(row.map(escapeCsv).join(','));
  }

  const csv = `\uFEFF${rows.join('\n')}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="qr-test-results.csv"');
  res.send(csv);
});

app.use((req, res) => {
  res.status(404).sendFile(page('404.html'), error => {
    if (error) {
      res.type('text').send('Страница не найдена');
    }
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  res.status(error.statusCode || error.status || 500).json({
    ok: false,
    message: 'Ошибка отдачи страницы',
    details: error.message,
    publicDir: PUBLIC_DIR
  });
});

ensureDataFiles()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`QR-тестирование запущено: http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Не удалось запустить приложение:', error);
    process.exit(1);
  });
