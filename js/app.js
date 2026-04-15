// ========================================================================
//  app.js — Entry-Point: DB init, Subject loading, Routing
// ========================================================================

import * as DB from './db.js';
import * as UI from './ui.js';
import * as E from './engine.js';

// ---------- Global API (for onclick handlers in HTML) ----------

window.APP = {
  // Navigation
  renderSubjects: () => UI.renderSubjects(),
  renderHome: () => UI.renderHome(),
  selectSubject: (id) => { UI.state.currentSubject = id; UI.renderHome(); },

  // Sprint
  goSprint: () => { UI.state.mode = 'sprint'; UI.renderSprintHome(); },
  renderSprintHome: () => UI.renderSprintHome(),
  startSprintTopic: (id) => UI.startSprintTopic(id),
  startGemischt: () => UI.startGemischt(),
  startSchwachstellen: () => UI.startSchwachstellen(),
  revealOptions: () => UI.revealOptions(),
  setConfidence: (c) => UI.setConfidence(c),
  selectOption: (i) => UI.selectOption(i),
  submitMCAnswer: () => UI.submitMCAnswer(),
  submitFillAnswer: () => UI.submitFillAnswer(),
  nextQuestion: () => UI.nextQuestion(),
  confirmBack: () => UI.confirmBack(),
  repeatQuiz: () => UI.repeatQuiz(),

  // Lernen
  goLernen: () => { UI.state.mode = 'lernen'; UI.renderLernenHome(); },
  renderLernenHome: () => UI.renderLernenHome(),
  startLernenSession: (includeNew) => UI.startLernenSession(includeNew),
  startLernenTopic: (id) => UI.startLernenTopic(id),
  startLernenInterleaved: () => UI.startLernenInterleaved(),
  toggleMerk: (key) => UI.toggleMerk(key),
  revealLernenAnswer: () => UI.revealLernenAnswer(),
  submitLernenFill: () => UI.submitLernenFill(),
  rateLernen: (r) => UI.rateLernen(r),
  confirmLernenBack: () => UI.confirmLernenBack(),

  // Stats & Theory
  renderGlobalStats: () => UI.renderGlobalStats(),
  showTheoryModal: () => UI.showTheoryModal(),
  resetStats: () => {
    const sid = UI.state.currentSubject;
    const allQs = E.getAllQuestions(sid);
    for (const q of allQs) {
      DB.run('DELETE FROM card_stats WHERE question_id = ?', [q.id]);
    }
    UI.renderGlobalStats();
  }
};

// ---------- Boot ----------

async function boot() {
  const appEl = document.getElementById('app');
  appEl.innerHTML = '<div class="empty-state"><div class="big">Lade…</div><div class="small">Datenbank wird initialisiert</div></div>';

  try {
    // Init SQLite
    await DB.initDB();

    // Migrate from localStorage (if old data exists)
    // We load subjects first so migration has question IDs to map to
    await loadAllSubjects();
    DB.migrateFromLocalStorage();

    // Render
    const subjects = E.getSubjects();
    if (subjects.length === 1) {
      // Only one subject → skip chooser, go directly to home
      UI.state.currentSubject = subjects[0].id;
      UI.renderHome();
    } else {
      UI.renderSubjects();
    }
  } catch (err) {
    console.error('Boot failed:', err);
    appEl.innerHTML = `<div class="empty-state"><div class="big">Fehler beim Laden</div><div class="small">${err.message}</div></div>`;
  }
}

async function loadAllSubjects() {
  // Fetch manifest
  const manifestResp = await fetch('subjects/_manifest.json');
  const manifest = await manifestResp.json();

  for (const entry of manifest.subjects) {
    const resp = await fetch('subjects/' + entry.file);
    const data = await resp.json();
    DB.loadSubjectData(data);
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
