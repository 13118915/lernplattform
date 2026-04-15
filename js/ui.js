// ========================================================================
//  ui.js — All Views (Subject Chooser, Home, Sprint, Lernen, Stats)
// ========================================================================

import * as DB from './db.js';
import * as E from './engine.js';

const app = () => document.getElementById('app');

// ---------- State ----------

export const state = {
  view: 'subjects',        // 'subjects' | 'home' | 'sprint' | 'lernen' | 'quiz' | 'lernen-card' | 'result' | 'stats'
  currentSubject: null,     // subject id
  subjectData: null,        // subject row from DB
  mode: null,               // 'sprint' | 'lernen'
  // Sprint
  subMode: null,
  currentTopic: null,
  questions: [],
  currentQ: 0,
  score: 0,
  wrong: [],
  selected: null,
  answered: false,
  confidence: null,
  currentFormat: 'mc',
  _fillCorrect: false,
  _fillGiven: '',
  recallPhase: true,
  _recallTimestamp: 0,
  // Lernen
  lernenQueue: [],
  lernenRevealed: false,
  lernenDone: 0,
  lernenNewLimit: 10,
  _lernenFillGiven: '',
  _lernenFillCorrect: false
};

// ---------- Subject Chooser (NEW) ----------

export function renderSubjects() {
  state.view = 'subjects';
  state.currentSubject = null;
  const subjects = E.getSubjects();

  let html = `
    <header class="masthead">
      <div class="masthead-left">
        <h1>Lern<em>plattform</em></h1>
        <div class="sub">Spaced Repetition · Active Recall · Interleaving</div>
      </div>
    </header>
    <p class="mode-intro">Wähle ein Fach, um zu starten.</p>
    <div class="mode-grid">
  `;

  for (const s of subjects) {
    const stats = E.getSubjectStats(s.id);
    let info = stats.total + ' Fragen';
    if (stats.due > 0) info += ` · <span style="color:var(--error);font-weight:600">${stats.due} fällig</span>`;
    else if (stats.answered > 0) info += ` · ${stats.answered} geübt`;

    html += `
      <button class="mode-card" style="--mc-color: ${s.color};" onclick="window.APP.selectSubject('${s.id}')">
        <h2>${s.icon || ''} ${s.name}</h2>
        <div class="tagline">${s.description || ''}</div>
        <div class="when">${info}</div>
      </button>
    `;
  }

  if (subjects.length === 0) {
    html += '<div class="empty-state"><div class="big">Keine Fächer geladen</div></div>';
  }

  html += '</div>';
  app().innerHTML = html;
}

// ---------- Home (Mode Chooser for selected subject) ----------

export function renderHome() {
  state.view = 'home';
  const s = DB.get('SELECT * FROM subjects WHERE id = ?', [state.currentSubject]);
  if (!s) { renderSubjects(); return; }
  state.subjectData = s;

  const today = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const stats = E.getSubjectStats(s.id);

  let html = `
    <button class="back-link" onclick="window.APP.renderSubjects()">← Fach wechseln</button>
    <header class="masthead">
      <div class="masthead-left">
        <h1>${s.name}<em> · Lernheft</em></h1>
        <div class="sub">${s.description || ''}</div>
      </div>
      <div class="masthead-right">${today}</div>
    </header>

    <p class="mode-intro">
      Wähle, wie du heute lernen möchtest. Beide Modi greifen auf dieselben
      <b>${stats.total} Fragen</b> zu — aber mit unterschiedlicher Methode.
      <button class="theory-trigger" onclick="window.APP.showTheoryModal()" title="Methodik & Wissenschaft">?</button>
    </p>

    <div class="mode-grid">
      <button class="mode-card" style="--mc-color: var(--sprint);" onclick="window.APP.goSprint()">
        <h2>Sprint<em>-Modus</em></h2>
        <div class="tagline">Schnell rein, Lücken finden.</div>
        <ul>
          <li>Multiple-Choice und Lückentext gemischt</li>
          <li>Active Recall: erst denken, dann Optionen</li>
          <li>Gewichtete Auswahl priorisiert Schwächen</li>
          <li>Diagnostisches Ergebnis statt Feier</li>
        </ul>
        <div class="when">
          <strong>Wann?</strong> Wenn du <em>morgen</em> abgefragt wirst.
          ${stats.answered > 0 ? '<br><span style="color:var(--ink)">' + stats.answered + ' Fragen gesehen' + (stats.weak > 0 ? ', <span style="color:var(--error);font-weight:600">' + stats.weak + ' Schwachstellen</span>' : '') + '</span>' : ''}
        </div>
      </button>

      <button class="mode-card" style="--mc-color: var(--lernen);" onclick="window.APP.goLernen()">
        <h2>Lernen<em>-Modus</em></h2>
        <div class="tagline">Verstehen, üben, behalten.</div>
        <ul>
          <li>Thema wählen, Merkwissen lesen, dann üben</li>
          <li>Karteikarten mit Spaced Repetition (FSRS)</li>
          <li>Gemischtes Lernen über alle Themen (Interleaving)</li>
          <li>Fällige Karten automatisch priorisiert</li>
        </ul>
        <div class="when">
          <strong>Wann?</strong> Wenn du es in <em>6 Monaten</em> noch können willst.
          ${stats.due > 0 ? '<br><span style="color:var(--error);font-weight:600">' + stats.due + ' Karten heute fällig</span>' : stats.review > 0 ? '<br><span style="color:var(--ink)">' + stats.review + ' Karten im Training</span>' : ''}
        </div>
      </button>
    </div>

    <div style="text-align:center;margin-top:-10px">
      <button class="back-link" onclick="window.APP.renderGlobalStats()" style="margin:0;font-size:13px;color:var(--ink-muted)">Gesamtstatistik einsehen →</button>
    </div>
  `;
  app().innerHTML = html;
}

// ---------- Sprint Home ----------

export function renderSprintHome() {
  state.view = 'sprint';
  state.mode = 'sprint';
  const sid = state.currentSubject;
  const allQs = E.getAllQuestions(sid);
  const topics = E.getTopics(sid);

  const weakQs = allQs.filter(q => {
    const s = DB.getCardStats(q.id);
    return s.wrong > 0 && s.wrong >= s.correct;
  });

  let topicSummary = '';
  for (const t of topics) {
    const qs = E.getQuestions(t.id);
    let seen = 0, total = 0;
    qs.forEach(q => {
      const s = DB.getCardStats(q.id);
      if (s.seen > 0) { seen++; total += s.seen; }
    });
    const correct = qs.reduce((sum, q) => sum + DB.getCardStats(q.id).correct, 0);
    const pct = total > 0 ? Math.round(correct / total * 100) : -1;
    const pctLabel = pct >= 0 ? pct + ' %' : '–';

    topicSummary += `<button class="quick-btn" onclick="window.APP.startSprintTopic('${t.id}')" style="--topic-color:${t.color}">`;
    topicSummary += `<span class="q-icon" style="color:${t.color};font-family:Fraunces,serif;font-weight:600;font-size:16px">${pctLabel}</span>`;
    topicSummary += `<div class="q-text"><strong>${t.name}</strong>`;
    topicSummary += `<span>${qs.length} Fragen${seen > 0 ? ', ' + seen + ' geübt' : ''}</span></div>`;
    topicSummary += '</button>';
  }

  let html = `
    <button class="back-link" onclick="window.APP.renderHome()">← Modus wechseln</button>
    <header class="masthead">
      <div class="masthead-left">
        <h1>Sprint<em>-Modus</em></h1>
        <div class="sub">Schnell testen · Lücken finden · MC + Lückentext</div>
      </div>
    </header>

    <div class="section-label">Schnellstart</div>
    <div class="quick-actions">
      <button class="quick-btn" onclick="window.APP.startGemischt()">
        <span class="q-icon" style="font-family:Fraunces,serif;font-weight:700;color:var(--accent)">20</span>
        <div class="q-text"><strong>Alle gemischt</strong><span>20 gewichtete Fragen quer durch alle Themen</span></div>
      </button>
      <button class="quick-btn" ${weakQs.length === 0 ? 'disabled' : ''} onclick="window.APP.startSchwachstellen()">
        <span class="q-icon" style="font-family:Fraunces,serif;font-weight:700;color:var(--error)">${weakQs.length}</span>
        <div class="q-text"><strong>Schwachstellen</strong><span>${weakQs.length === 0 ? 'Noch keine Fehler aufgezeichnet' : weakQs.length + ' Fragen gezielt wiederholen'}</span></div>
      </button>
    </div>

    <div class="section-label">Nach Thema</div>
    <div class="quick-actions" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
      ${topicSummary}
    </div>
  `;
  app().innerHTML = html;
}

// ---------- Sprint Quiz ----------

function prepQ(q) {
  q._format = E.chooseFormat(q);
  q.opts = JSON.parse(q.options);
  return q;
}

export function startSprintTopic(topicId) {
  state.subMode = 'topic'; state.currentTopic = topicId;
  const pool = E.getQuestions(topicId).map(q => {
    const t = DB.get('SELECT * FROM topics WHERE id = ?', [topicId]);
    return Object.assign({}, q, { topic_name: t.name, topic_color: t.color, topic_color_soft: t.color_soft });
  });
  state.questions = E.selectWeightedQuestions(pool, Math.min(10, pool.length)).map(prepQ);
  resetQuizState(); renderQuiz();
}

export function startGemischt() {
  state.subMode = 'gemischt'; state.currentTopic = null;
  const pool = E.getAllQuestions(state.currentSubject);
  state.questions = E.selectWeightedQuestions(pool, 20).map(prepQ);
  resetQuizState(); renderQuiz();
}

export function startSchwachstellen() {
  const allQs = E.getAllQuestions(state.currentSubject);
  const weak = allQs.filter(q => {
    const s = DB.getCardStats(q.id);
    return s.wrong > 0 && s.wrong >= s.correct;
  });
  if (weak.length === 0) return;
  state.subMode = 'schwachstellen'; state.currentTopic = null;
  state.questions = E.shuffle(weak).map(prepQ);
  resetQuizState(); renderQuiz();
}

function resetQuizState() {
  state.currentQ = 0; state.score = 0; state.wrong = [];
  state.selected = null; state.answered = false; state.confidence = null;
  state._fillCorrect = false; state._fillGiven = '';
  state.recallPhase = true; state._recallTimestamp = 0;
  state.view = 'quiz';
}

export function renderQuiz() {
  const q = state.questions[state.currentQ];
  const total = state.questions.length;
  const progress = (state.currentQ / total) * 100;
  const color = q.topic_color || 'var(--accent)';
  const colorSoft = q.topic_color_soft || 'var(--accent-soft)';
  const label = state.subMode === 'gemischt' ? 'Gemischt' :
                state.subMode === 'schwachstellen' ? 'Schwachstellen' : q.topic_name;

  let html = '<div class="card" style="--topic-color: ' + color + '; --topic-soft: ' + colorSoft + ';">';
  html += '<div class="quiz-top">';
  html += '<button class="back" onclick="window.APP.confirmBack()">← Abbrechen</button>';
  html += '<div class="quiz-meta">' + label + ' · <b>' + state.score + '</b> richtig</div>';
  html += '</div>';
  html += '<div class="progress"><div class="progress-fill" style="width:' + progress + '%"></div></div>';

  const formatLabel = q._format === 'fill' ? 'Lückentext' : 'Multiple Choice';
  html += '<div class="format-badge">' + formatLabel + '</div>';

  if (q._format === 'fill' && q.fill_prompt) {
    html += renderQuizFill(q);
  } else {
    html += renderQuizMC(q);
  }

  html += '</div>';
  app().innerHTML = html;

  if (q._format === 'fill' && q.fill_prompt && !state.answered) {
    const inp = document.getElementById('fill-input');
    if (inp) { inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') window.APP.submitFillAnswer(); }); }
  }
}

function renderQuizMC(q) {
  let html = '';
  html += '<div class="q-num">Frage ' + (state.currentQ + 1) + ' von ' + state.questions.length;
  if (state.subMode === 'gemischt') html += ' · ' + q.topic_name;
  html += '</div>';
  html += '<div class="q-text">' + q.question + '</div>';

  // Active Recall Phase
  if (state.recallPhase && !state.answered) {
    html += '<div class="recall-prompt">';
    html += '<div class="recall-icon">💭</div>';
    html += '<p>Überlege zuerst: Was könnte die Antwort sein?<br>Erst denken, dann die Optionen sehen.</p>';
    html += '<button class="recall-btn" onclick="window.APP.revealOptions()">Optionen zeigen →</button>';
    html += '</div>';
    return html;
  }

  if (!state.answered) {
    html += '<div class="confidence"><span class="confidence-label">Wie sicher bist du?</span><div class="conf-buttons">';
    html += '<button class="conf-btn ' + (state.confidence === 'sicher' ? 'active' : '') + '" onclick="window.APP.setConfidence(\'sicher\')">Sicher</button>';
    html += '<button class="conf-btn ' + (state.confidence === 'unsicher' ? 'active' : '') + '" onclick="window.APP.setConfidence(\'unsicher\')">Unsicher</button>';
    html += '</div></div>';
  }

  html += '<div class="opts">';
  const letters = ['A', 'B', 'C', 'D', 'E'];
  for (let i = 0; i < q.opts.length; i++) {
    let cls = 'opt';
    if (state.answered) {
      if (i === q.correct_index) cls += ' correct';
      else if (i === state.selected) cls += ' incorrect';
    } else if (state.selected === i) cls += ' selected';
    const dis = state.answered ? 'disabled' : '';
    html += '<button class="' + cls + '" ' + dis + ' onclick="window.APP.selectOption(' + i + ')">';
    html += '<span class="opt-letter">' + letters[i] + '</span><span>' + q.opts[i] + '</span></button>';
  }
  html += '</div>';

  if (state.answered) {
    const isCorrect = state.selected === q.correct_index;
    let confNote = '';
    if (!isCorrect && state.confidence === 'sicher') confNote = '<span class="conf-note">Du warst dir sicher — merke dir diese besonders.</span>';
    else if (isCorrect && state.confidence === 'unsicher') confNote = '<span class="conf-note">Du wusstest es — vertrau dir mehr.</span>';
    html += '<div class="feedback ' + (isCorrect ? 'correct' : 'incorrect') + '">';
    html += '<span class="label">' + (isCorrect ? 'Richtig.' : 'Falsch.') + '</span>' + q.explanation + confNote + '</div>';
  }

  html += '<div class="nav">';
  if (!state.answered) {
    html += '<span></span><button class="btn" onclick="window.APP.submitMCAnswer()" ' + (state.selected === null ? 'disabled' : '') + '>Prüfen</button>';
  } else {
    const next = state.currentQ + 1 < state.questions.length ? 'Nächste Frage →' : 'Ergebnis →';
    html += '<span></span><button class="btn" onclick="window.APP.nextQuestion()">' + next + '</button>';
  }
  html += '</div>';
  return html;
}

function renderQuizFill(q) {
  let html = '';
  html += '<div class="q-num">Frage ' + (state.currentQ + 1) + ' von ' + state.questions.length;
  if (state.subMode === 'gemischt') html += ' · ' + q.topic_name;
  html += '</div>';
  html += '<div class="fill-wrap"><div class="fill-prompt">' + q.fill_prompt.replace(/\n/g, '<br>') + '</div>';

  if (q.fill_hint && !state.answered) html += '<div class="fill-hint">Hinweis: ' + q.fill_hint + '</div>';

  if (!state.answered) {
    html += '<div class="fill-input-row"><input type="text" id="fill-input" class="fill-input" autocomplete="off" autocapitalize="off" placeholder="Antwort eingeben…">';
    html += '<button class="btn" onclick="window.APP.submitFillAnswer()" style="min-width:90px">Prüfen</button></div>';
  } else {
    html += '<div class="fill-input-row"><input type="text" class="fill-input ' + (state._fillCorrect ? 'correct' : 'incorrect') + '" value="' + (state._fillGiven || '').replace(/"/g, '&quot;') + '" disabled></div>';
    if (!state._fillCorrect) html += '<div class="fill-correct-answer">Richtig: ' + q.fill_answer + '</div>';
    html += '<div class="feedback ' + (state._fillCorrect ? 'correct' : 'incorrect') + '"><span class="label">' + (state._fillCorrect ? 'Richtig.' : 'Falsch.') + '</span>' + (q.explanation || '') + '</div>';
  }
  html += '</div>';

  if (state.answered) {
    const next = state.currentQ + 1 < state.questions.length ? 'Nächste Frage →' : 'Ergebnis →';
    html += '<div class="nav"><span></span><button class="btn" onclick="window.APP.nextQuestion()">' + next + '</button></div>';
  }
  return html;
}

// Sprint interactions
export function revealOptions() { state.recallPhase = false; state._recallTimestamp = Date.now(); renderQuiz(); }
export function setConfidence(c) { if (!state.answered) { state.confidence = c; renderQuiz(); } }
export function selectOption(i) { if (!state.answered) { state.selected = i; renderQuiz(); } }

export function submitMCAnswer() {
  const q = state.questions[state.currentQ];
  state.answered = true;
  const isCorrect = state.selected === q.correct_index;
  if (isCorrect) state.score++;
  else state.wrong.push({ q, topicName: q.topic_name });
  E.recordAnswer(q.id, isCorrect, state.confidence === 'sicher', 'mc');
  renderQuiz();
}

export function submitFillAnswer() {
  const q = state.questions[state.currentQ];
  const inp = document.getElementById('fill-input');
  if (!inp) return;
  const given = inp.value.trim();
  if (!given) return;
  state.answered = true;
  state._fillCorrect = E.checkFillCorrect(q, given);
  state._fillGiven = given;
  if (state._fillCorrect) state.score++;
  else state.wrong.push({ q, topicName: q.topic_name, given, correctAnswer: q.fill_answer });
  E.recordAnswer(q.id, state._fillCorrect, true, 'fill');
  renderQuiz();
}

export function nextQuestion() {
  if (state.currentQ + 1 < state.questions.length) {
    state.currentQ++;
    state.selected = null; state.answered = false; state.confidence = null;
    state._fillCorrect = false; state._fillGiven = '';
    state.recallPhase = true; state._recallTimestamp = 0;
    renderQuiz();
  } else {
    renderResult();
  }
}

export function confirmBack() { if (confirm('Übung abbrechen?')) renderSprintHome(); }

// ---------- Sprint Result ----------

export function renderResult() {
  state.view = 'result';
  const total = state.questions.length;
  const pct = Math.round((state.score / total) * 100);
  const q0 = state.questions[0];
  const color = state.subMode === 'gemischt' ? 'var(--accent)' : state.subMode === 'schwachstellen' ? 'var(--warn)' : q0.topic_color;
  const colorSoft = state.subMode === 'gemischt' ? 'var(--accent-soft)' : state.subMode === 'schwachstellen' ? 'var(--warn-soft)' : q0.topic_color_soft;
  const label = state.subMode === 'gemischt' ? 'Gemischt' : state.subMode === 'schwachstellen' ? 'Schwachstellen' : q0.topic_name;

  let msg = '';
  if (pct === 100) msg = 'Alle richtig. Wechsle zum Lernen-Modus für langfristige Festigung.';
  else if (pct >= 80) msg = 'Solide Basis. Die verbleibenden Fehler zeigen, wo Wiederholung sinnvoll ist.';
  else if (pct >= 60) msg = 'Grundverständnis vorhanden. Mehrere Bereiche erfordern systematische Wiederholung.';
  else if (pct >= 40) msg = 'Lücken vorhanden. Lies das Merkwissen im Lernen-Modus, dann erneut testen.';
  else msg = 'Deutliche Lücken. Arbeite die Grundlagen im Lernen-Modus systematisch durch.';

  let html = '<div class="card" style="--topic-color: ' + color + '; --topic-soft: ' + colorSoft + ';">';
  html += '<div class="quiz-top"><button class="back" onclick="window.APP.renderSprintHome()">← Übersicht</button>';
  html += '<div class="quiz-meta">' + label + '</div></div>';
  html += '<div class="result"><div class="result-label">Diagnose</div>';
  html += '<div class="result-score">' + state.score + '<span class="slash">/</span><span class="total">' + total + '</span></div>';
  html += '<div class="result-pct">' + pct + ' %</div><div class="result-msg">' + msg + '</div>';

  if (state.wrong.length > 0) {
    const byTopic = {};
    for (const w of state.wrong) byTopic[w.topicName] = (byTopic[w.topicName] || 0) + 1;
    html += '<div class="wrong-detail"><h4>Fehlerbereiche</h4>';
    for (const [topic, count] of Object.entries(byTopic)) {
      html += '<div class="topic-line"><span>' + topic + '</span><span class="count">' + count + '</span></div>';
    }
    html += '</div>';
  }

  html += '<div class="result-actions">';
  html += '<button class="btn btn-ghost" onclick="window.APP.renderSprintHome()">Zur Übersicht</button>';
  html += '<button class="btn" onclick="window.APP.repeatQuiz()">Nochmal</button>';
  html += '</div></div></div>';
  app().innerHTML = html;
}

export function repeatQuiz() {
  if (state.subMode === 'topic') startSprintTopic(state.currentTopic);
  else if (state.subMode === 'gemischt') startGemischt();
  else if (state.subMode === 'schwachstellen') startSchwachstellen();
}

// ---------- Lernen Home ----------

export function renderLernenHome() {
  state.view = 'lernen'; state.mode = 'lernen';
  const sid = state.currentSubject;
  const stats = E.getSubjectStats(sid);
  const topics = E.getTopics(sid);
  const now = Date.now();

  let html = `
    <button class="back-link" onclick="window.APP.renderHome()">← Modus wechseln</button>
    <header class="masthead">
      <div class="masthead-left">
        <h1>Lernen<em>-Modus</em></h1>
        <div class="sub">Verstehen · Üben · Wiederholen (FSRS)</div>
      </div>
    </header>

    <div class="dash">
      <div class="dash-item due"><div class="num">${stats.due}</div><div class="lbl">Heute fällig</div></div>
      <div class="dash-item"><div class="num">${stats.newCount}</div><div class="lbl">Neu</div></div>
      <div class="dash-item"><div class="num">${stats.learning}</div><div class="lbl">Lernphase</div></div>
      <div class="dash-item"><div class="num">${stats.review}</div><div class="lbl">Im Review</div></div>
    </div>
  `;

  if (stats.due > 0) {
    html += `<div class="banner" style="margin-bottom:20px"><strong>${stats.due} Karten heute fällig.</strong> Nimm dir ~${Math.ceil(stats.due * 0.5)} Minuten.</div>`;
    html += `<div style="display:flex;gap:10px;margin-bottom:32px;flex-wrap:wrap">`;
    html += `<button class="btn" style="--topic-color:var(--lernen);border-color:var(--lernen);background:var(--lernen);" onclick="window.APP.startLernenSession()">Fällige Karten üben</button>`;
    if (stats.newCount > 0) html += `<button class="btn btn-ghost" onclick="window.APP.startLernenSession(true)">+ neue Karten dazu</button>`;
    html += '</div>';
  } else if (stats.newCount > 0 && stats.learning + stats.review === 0) {
    html += `<div class="empty-state" style="margin-bottom:24px"><div class="big">Willkommen im Lernen-Modus</div><div class="small">Wähle unten ein Thema, lies das Merkwissen durch und starte die Übung.</div></div>`;
  } else {
    html += `<div class="banner" style="margin-bottom:24px"><strong>Keine Karten fällig.</strong> Komm morgen wieder — oder arbeite ein neues Thema durch.</div>`;
  }

  // Interleaved option
  html += '<div class="section-label">Themenübergreifend</div>';
  html += '<div class="quick-actions" style="margin-bottom:28px">';
  html += '<button class="quick-btn" onclick="window.APP.startLernenInterleaved()" style="--topic-color:var(--lernen)">';
  html += '<span class="q-icon" style="font-family:Fraunces,serif;font-weight:700;color:var(--lernen)">⟳</span>';
  html += '<div class="q-text"><strong>Gemischt lernen</strong><span>10 Karten aus allen Themen, intelligent gemischt (Interleaving)</span></div></button></div>';

  // Topics
  html += '<div class="section-label">Themen durcharbeiten</div><div class="topics">';
  let idx = 1;
  for (const t of topics) {
    const num = String(idx).padStart(2, '0');
    const qs = E.getQuestions(t.id);
    let topicSeen = 0, topicDue = 0;
    qs.forEach(q => {
      const s = DB.getCardStats(q.id);
      if (s.seen > 0) { topicSeen++; if (s.due && s.due <= now) topicDue++; }
    });

    const merk = E.getMerkwissen(t.id);
    let merkHTML = '';
    for (const m of merk) {
      if (m.tip) { merkHTML += '<div class="tip">' + m.tip + '</div>'; }
      else { merkHTML += '<h4>' + m.heading + '</h4><ul>'; const items = JSON.parse(m.items || '[]'); for (const item of items) merkHTML += '<li>' + item + '</li>'; merkHTML += '</ul>'; }
    }

    html += `
      <article class="topic" style="--topic-color: ${t.color}; --topic-soft: ${t.color_soft};">
        <div class="topic-head">
          <div class="topic-num">${num}</div>
          <div class="topic-main"><h3>${t.name}</h3><p>${t.description || ''}</p></div>
          <div class="topic-actions">
            ${topicDue > 0 ? '<span class="topic-stats warn">' + topicDue + ' fällig</span>' : topicSeen > 0 ? '<span class="topic-stats">' + topicSeen + '/' + qs.length + ' gelernt</span>' : ''}
          </div>
        </div>
        <div class="merkkasten" id="merk-${t.id}"><div class="merkkasten-inner">${merkHTML}</div></div>
        <div class="topic-bar">
          <button onclick="window.APP.toggleMerk('${t.id}')" id="merkbtn-${t.id}">Merkwissen</button>
          <button class="primary" onclick="window.APP.startLernenTopic('${t.id}')">Üben →</button>
        </div>
      </article>
    `;
    idx++;
  }
  html += '</div>';
  html += `<p class="intro" style="font-size:14px; margin-top:24px;"><b>Tipp:</b> Lies zuerst das Merkwissen eines Themas, dann übe die Karten.</p>`;
  app().innerHTML = html;
}

export function toggleMerk(key) {
  const el = document.getElementById('merk-' + key);
  const btn = document.getElementById('merkbtn-' + key);
  if (el.classList.contains('open')) { el.classList.remove('open'); btn.textContent = 'Merkwissen'; }
  else { el.classList.add('open'); btn.textContent = 'Merkwissen schließen'; }
}

// ---------- Lernen Sessions ----------

export function startLernenSession(includeNew) {
  const allQs = E.getAllQuestions(state.currentSubject);
  const now = Date.now();
  let queue = allQs.filter(q => {
    const s = DB.getCardStats(q.id);
    return s.state !== 'new' && s.due && s.due <= now;
  });

  if (includeNew || queue.length === 0) {
    const newCards = allQs.filter(q => DB.getCardStats(q.id).state === 'new').slice(0, state.lernenNewLimit);
    queue = queue.concat(newCards);
  }
  if (queue.length === 0) { alert('Keine Karten zum Üben.'); return; }

  state.lernenQueue = E.shuffle(queue).map(q => { q._format = E.chooseFormat(q); q.opts = JSON.parse(q.options); return q; });
  state.lernenRevealed = false; state.lernenDone = 0;
  state._lernenFillGiven = ''; state._lernenFillCorrect = false;
  state.view = 'lernen-card'; renderLernenCard();
}

export function startLernenTopic(topicId) {
  const now = Date.now();
  const pool = E.getQuestions(topicId).map(q => {
    const t = DB.get('SELECT * FROM topics WHERE id = ?', [topicId]);
    return Object.assign({}, q, { topic_name: t.name, topic_color: t.color, topic_color_soft: t.color_soft });
  });

  pool.sort((a, b) => {
    const sa = DB.getCardStats(a.id), sb = DB.getCardStats(b.id);
    const isDueA = sa.due > 0 && sa.due <= now, isDueB = sb.due > 0 && sb.due <= now;
    if (isDueA && !isDueB) return -1;
    if (isDueB && !isDueA) return 1;
    if (isDueA && isDueB) return E.getRetrievability(a.id) - E.getRetrievability(b.id);
    if (sa.state === 'new' && sb.state !== 'new') return -1;
    if (sb.state === 'new' && sa.state !== 'new') return 1;
    return 0;
  });

  state.lernenQueue = pool.slice(0, 10).map(q => { q._format = E.chooseFormat(q); q.opts = JSON.parse(q.options); return q; });
  state.lernenRevealed = false; state.lernenDone = 0;
  state._lernenFillGiven = ''; state._lernenFillCorrect = false;
  state.view = 'lernen-card'; renderLernenCard();
}

export function startLernenInterleaved() {
  const allQs = E.getAllQuestions(state.currentSubject);
  const now = Date.now();

  const scored = allQs.map(q => {
    const s = DB.getCardStats(q.id);
    let priority;
    if (s.state === 'new') priority = 0.5;
    else if (s.due && s.due <= now) priority = 1 - E.getRetrievability(q.id);
    else priority = -1;
    return { q, priority };
  });

  let candidates = scored.filter(x => x.priority >= 0).sort((a, b) => b.priority - a.priority);
  if (candidates.length === 0) { alert('Keine Karten zum Üben.'); return; }

  const selected = candidates.slice(0, 10).map(x => x.q);
  const interleaved = E.interleaveByTopic(selected);

  state.lernenQueue = interleaved.map(q => { q._format = E.chooseFormat(q); q.opts = JSON.parse(q.options); return q; });
  state.lernenRevealed = false; state.lernenDone = 0;
  state._lernenFillGiven = ''; state._lernenFillCorrect = false;
  state.view = 'lernen-card'; renderLernenCard();
}

// ---------- Lernen Card Rendering ----------

export function renderLernenCard() {
  if (state.lernenQueue.length === 0) { renderLernenDone(); return; }
  const q = state.lernenQueue[0];
  const totalInSession = state.lernenQueue.length + state.lernenDone;
  const progress = (state.lernenDone / totalInSession) * 100;
  const s = DB.getCardStats(q.id);
  const isNew = s.state === 'new';
  const color = q.topic_color || 'var(--lernen)';
  const colorSoft = q.topic_color_soft || 'var(--lernen-soft)';

  let html = '<div class="card" style="--topic-color: ' + color + '; --topic-soft: ' + colorSoft + ';">';
  html += '<div class="quiz-top"><button class="back" onclick="window.APP.confirmLernenBack()">← Abbrechen</button>';
  html += '<div class="quiz-meta">' + (q.topic_name || '') + ' · <b>' + state.lernenDone + '</b>/' + totalInSession + '</div></div>';
  html += '<div class="progress"><div class="progress-fill" style="width:' + progress + '%"></div></div>';

  const formatLabel = q._format === 'fill' ? ' · Lückentext' : '';
  html += '<div class="q-num">' + (isNew ? 'Neue Karte' : 'Wiederholung') + formatLabel + '</div>';

  if (q._format === 'fill' && q.fill_prompt) {
    html += renderLernenFill(q);
  } else {
    html += renderLernenReveal(q);
  }

  html += '</div>';
  app().innerHTML = html;

  if (q._format === 'fill' && q.fill_prompt && !state.lernenRevealed) {
    const inp = document.getElementById('lernen-fill-input');
    if (inp) { inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') window.APP.submitLernenFill(); }); }
  }
}

function renderLernenReveal(q) {
  let html = '<div class="lernen-question"><div class="lernen-prompt">Frage</div>';
  html += '<div class="q-text" style="margin-bottom:0">' + q.question + '</div></div>';

  if (!state.lernenRevealed) {
    html += '<button class="reveal-btn" onclick="window.APP.revealLernenAnswer()">Denk nach … dann klicken zum Aufdecken</button>';
  } else {
    html += '<div class="lernen-answer"><span class="answer-label">Richtige Antwort</span>';
    html += '<div class="answer-text">' + q.opts[q.correct_index] + '</div>';
    html += '<div class="answer-exp">' + (q.explanation || '') + '</div></div>';
    html += renderRateButtons(q);
  }
  return html;
}

function renderLernenFill(q) {
  let html = '<div class="lernen-question"><div class="lernen-prompt">Vervollständige</div>';
  html += '<div class="fill-wrap" style="margin-top:12px"><div class="fill-prompt">' + q.fill_prompt.replace(/\n/g, '<br>') + '</div>';

  if (!state.lernenRevealed) {
    if (q.fill_hint) html += '<div class="fill-hint">Hinweis: ' + q.fill_hint + '</div>';
    html += '<div class="fill-input-row"><input type="text" id="lernen-fill-input" class="fill-input" autocomplete="off" autocapitalize="off" placeholder="Antwort eingeben…">';
    html += '<button class="btn" onclick="window.APP.submitLernenFill()" style="min-width:90px">Prüfen</button></div>';
  } else {
    const given = state._lernenFillGiven || '';
    const wasCorrect = state._lernenFillCorrect;
    html += '<div class="fill-input-row"><input type="text" class="fill-input ' + (wasCorrect ? 'correct' : 'incorrect') + '" value="' + given.replace(/"/g, '&quot;') + '" disabled></div>';
    if (!wasCorrect) html += '<div class="fill-correct-answer">Richtig: ' + q.fill_answer + '</div>';
    html += renderRateButtons(q);
  }

  html += '</div></div>';
  return html;
}

function renderRateButtons(q) {
  const againT = E.getNextIntervalText(q.id, 1);
  const goodT  = E.getNextIntervalText(q.id, 3);
  const easyT  = E.getNextIntervalText(q.id, 4);
  return `
    <div class="section-label" style="margin-top:22px;">Wie gut wusstest du es?</div>
    <div class="rate-grid">
      <button class="rate-btn again" onclick="window.APP.rateLernen('again')"><span class="rate-title">Nochmal</span><span class="rate-when">${againT}</span></button>
      <button class="rate-btn gut" onclick="window.APP.rateLernen('gut')"><span class="rate-title">Gut</span><span class="rate-when">${goodT}</span></button>
      <button class="rate-btn einfach" onclick="window.APP.rateLernen('einfach')"><span class="rate-title">Einfach</span><span class="rate-when">${easyT}</span></button>
    </div>`;
}

// Lernen interactions
export function revealLernenAnswer() { state.lernenRevealed = true; renderLernenCard(); }

export function submitLernenFill() {
  const q = state.lernenQueue[0];
  const inp = document.getElementById('lernen-fill-input');
  if (!inp) return;
  const given = inp.value.trim();
  if (!given) return;
  state._lernenFillGiven = given;
  state._lernenFillCorrect = E.checkFillCorrect(q, given);
  state.lernenRevealed = true;
  renderLernenCard();
}

export function rateLernen(rating) {
  const q = state.lernenQueue[0];
  const gradeMap = { again: 1, gut: 3, einfach: 4 };
  const grade = gradeMap[rating] || 1;
  const format = (q._format === 'fill' && q.fill_prompt) ? 'fill' : 'mc';

  E.gradeCard(q.id, grade);
  // Update format stats
  const s = DB.getCardStats(q.id);
  const fmtUpdate = {};
  fmtUpdate[format + '_seen'] = s[format + '_seen'] + 1;
  if (grade >= 2) fmtUpdate[format + '_correct'] = s[format + '_correct'] + 1;
  DB.updateCardStats(q.id, fmtUpdate);

  const current = state.lernenQueue.shift();
  state.lernenDone++;
  state.lernenRevealed = false;
  state._lernenFillGiven = ''; state._lernenFillCorrect = false;
  if (rating === 'again') state.lernenQueue.push(current);
  renderLernenCard();
}

function renderLernenDone() {
  let html = '<div class="card"><div class="result"><div class="result-label">Sitzung abgeschlossen</div>';
  html += '<div class="result-score" style="color:var(--lernen)">' + state.lernenDone + '</div>';
  html += '<div class="result-msg">Karten bearbeitet</div>';
  html += '<div class="result-actions"><button class="btn" style="--topic-color:var(--lernen);border-color:var(--lernen);background:var(--lernen);" onclick="window.APP.renderLernenHome()">Zur Übersicht</button></div></div></div>';
  app().innerHTML = html;
}

export function confirmLernenBack() {
  if (confirm('Session abbrechen? Fortschritt ist gespeichert.')) renderLernenHome();
}

// ---------- Global Stats ----------

export function renderGlobalStats() {
  state.view = 'stats';
  const sid = state.currentSubject;
  const topics = E.getTopics(sid);

  let html = '<button class="back-link" onclick="window.APP.renderHome()">← Zurück</button>';
  html += '<header class="masthead"><div class="masthead-left"><h1>Gesamt<em>-Statistik</em></h1><div class="sub">Alle Modi · Alle Themen</div></div></header>';
  html += '<div class="diagnosis">';

  let globalSeen = 0, globalCorrect = 0;

  for (const t of topics) {
    const qs = E.getQuestions(t.id);
    let seen = 0, correct = 0, mcSeen = 0, mcCorrect = 0, fillSeen = 0, fillCorrect = 0;
    qs.forEach(q => {
      const s = DB.getCardStats(q.id);
      seen += s.seen; correct += s.correct;
      mcSeen += s.mc_seen; mcCorrect += s.mc_correct;
      fillSeen += s.fill_seen; fillCorrect += s.fill_correct;
    });
    globalSeen += seen; globalCorrect += correct;
    const pct = seen > 0 ? Math.round(correct / seen * 100) : 0;

    html += '<div class="diagnosis-section" style="border-left:3px solid ' + t.color + ';padding-left:16px;margin-bottom:18px">';
    html += '<h4 style="color:' + t.color + '">' + t.name + '</h4>';
    if (seen > 0) {
      html += '<div class="diagnosis-bar"><span class="d-label">' + seen + ' Antworten</span>';
      html += '<span class="d-bar"><span class="d-bar-fill" style="width:' + pct + '%;background:' + t.color + '"></span></span>';
      html += '<span class="d-pct ' + (pct < 50 ? 'weak' : pct < 75 ? 'ok' : 'strong') + '">' + pct + '%</span></div>';
      html += '<div style="font-size:12px;color:var(--ink-muted);margin-top:2px">MC: ' + (mcSeen > 0 ? Math.round(mcCorrect / mcSeen * 100) + '%' : '–') + ' · Lückentext: ' + (fillSeen > 0 ? Math.round(fillCorrect / fillSeen * 100) + '%' : '–') + '</div>';
    } else {
      html += '<div style="font-size:13px;color:var(--ink-muted);padding:4px 0">Noch nicht geübt</div>';
    }
    html += '</div>';
  }

  const gPct = globalSeen > 0 ? Math.round(globalCorrect / globalSeen * 100) : 0;
  html += '<div class="diagnosis-section" style="border-top:1px solid var(--line);padding-top:16px;margin-top:8px"><h4>Gesamt</h4>';
  if (globalSeen > 0) {
    html += '<div class="diagnosis-bar"><span class="d-label">' + globalSeen + ' Antworten</span>';
    html += '<span class="d-bar"><span class="d-bar-fill" style="width:' + gPct + '%;background:var(--ink)"></span></span>';
    html += '<span class="d-pct">' + gPct + '%</span></div>';
  } else {
    html += '<div style="font-size:13px;color:var(--ink-muted);padding:4px 0">Noch keine Daten</div>';
  }
  html += '</div>';
  html += '<div style="margin-top:24px;text-align:center"><button class="btn btn-ghost" onclick="if(confirm(\'Statistiken zurücksetzen?\')){window.APP.resetStats();}">Statistiken zurücksetzen</button></div>';
  html += '</div>';
  app().innerHTML = html;
}

// ---------- Theory Modal ----------

export function showTheoryModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal-box">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      <h3>Methodik &amp; Wissenschaft</h3>
      <h4>1. Zwei Systeme im Kopf</h4>
      <p>Der Psychologe Daniel Kahneman unterscheidet zwei Denkmodi: <b>System 1</b> arbeitet schnell, automatisch und intuitiv — <b>System 2</b> langsam, bewusst und analytisch. Lernen braucht beides.</p>
      <p><b>Sprint-Modus → System 1:</b> Gewichtete Zufallsauswahl priorisiert Schwächen und <em>confident errors</em>. Ziel: Lücken aufdecken.</p>
      <p><b>Lernen-Modus → System 2:</b> Karteikarten mit adaptivem Scheduling. Merkwissen liefert Kontext.</p>
      <h4>2. Spacing — FSRS statt SM-2</h4>
      <p>Diese App nutzt <b>FSRS-4.5</b> (Free Spaced Repetition Scheduler). FSRS modelliert das Gedächtnis mit drei Komponenten:</p>
      <p><b>Stabilität</b> — wie viele Tage eine Erinnerung hält. <b>Schwierigkeit</b> — wie leicht du eine Karte findest (1–10). <b>Abrufwahrscheinlichkeit</b> — wie wahrscheinlich du die Antwort jetzt noch weißt: R(t) = (1 + t/9S)<sup>−1</sup>.</p>
      <p>~30% weniger Wiederholungen bei gleicher Behaltensleistung im Vergleich zu SM-2.</p>
      <h4>3. Active Recall</h4>
      <p>Bei MC-Fragen siehst du zuerst <em>nur die Frage</em>. Der zusätzliche Abrufversuch aktiviert tiefere Gedächtnisspuren — der <em>Testing Effect</em> (Roediger &amp; Butler, 2011). Lückentext fordert vollständige Produktion — eine <em>Desirable Difficulty</em> (Bjork &amp; Bjork, 2020).</p>
      <h4>4. Interleaving</h4>
      <p>„Gemischt lernen" sortiert Karten so, dass aufeinanderfolgende Karten verschiedene Themen behandeln. <em>Interleaving</em> verbessert die Unterscheidungsfähigkeit um 20–50% (Rohrer, 2015).</p>
      <h4>5. Keine Gamification</h4>
      <p>Diagnostisches Feedback statt Streaks und Punkte.</p>
      <div class="source">
        <b>Quellen</b><br>
        Kahneman, D. (2011). <em>Thinking, Fast and Slow.</em><br>
        Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings.<br>
        Bjork, R. A. &amp; Bjork, E. L. (2020). Desirable difficulties in theory and practice.<br>
        Wozniak, P. A. &amp; Gorzelanczyk, E. J. (1994). Optimization of repetition spacing (SM-2).<br>
        Ye, J. (2024). FSRS-4.5. github.com/open-spaced-repetition.<br>
        Roediger, H. L. &amp; Butler, A. C. (2011). The critical role of retrieval practice in long-term retention.<br>
        Rohrer, D. (2015). Interleaving helps students distinguish among similar concepts.
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}
