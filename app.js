/* ===================================================================
   Momentum — Productivity Hub   |   app.js
   Firebase Firestore-backed storage (replaces localStorage).
   All data is saved to Firestore and syncs across devices.
   =================================================================== */

(async function () {
  'use strict';

  // ===================== FIREBASE STORE =====================
  // Replaces the old localStorage store.
  // On load: fetches all data from Firestore into a local cache.
  // On set:  updates cache immediately, then writes to Firestore in background.

  const DOC_REF = window.db.collection('momentum').doc('userData');

  // Local in-memory cache — loaded from Firestore on startup
  let _cache = {};

  async function loadFromFirebase() {
    try {
      const snap = await DOC_REF.get();
      if (snap.exists) {
        const raw = snap.data();
        // Each field is stored as a JSON string
        for (const key in raw) {
          try { _cache[key] = JSON.parse(raw[key]); }
          catch { _cache[key] = raw[key]; }
        }
      }
    } catch (err) {
      console.error('Momentum: Failed to load from Firebase:', err);
    }
  }

  const store = {
    get(key, fallback) {
      return key in _cache ? _cache[key] : fallback;
    },
    set(key, val) {
      _cache[key] = val;
      // Write to Firestore in background — non-blocking
      DOC_REF.set({ [key]: JSON.stringify(val) }, { merge: true })
        .catch(err => console.error('Momentum: Failed to save to Firebase:', err));
    }
  };

  // ===================== BOOT SEQUENCE =====================
  // Load all data from Firestore before initialising the UI

  const loadingEl = document.getElementById('app-loading');

  await loadFromFirebase();

  // Hide loading screen with a fade
  loadingEl.classList.add('fade-out');
  setTimeout(() => loadingEl.remove(), 450);

  // ===================== HELPERS =====================
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>';

  // ===================== NAVIGATION =====================
  const navBtns = $$('.nav-btn');
  const sections = $$('.section');

  function navigate(sectionId) {
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.section === sectionId));
    sections.forEach(s => {
      s.classList.toggle('active', s.id === `section-${sectionId}`);
    });
    store.set('activeSection', sectionId);
  }

  navBtns.forEach(b => b.addEventListener('click', () => navigate(b.dataset.section)));

  const saved = store.get('activeSection', 'writing');
  navigate(saved);

  const now = new Date();
  $('#current-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ===================== WRITING GOALS =====================
  const writingState = {
    target: store.get('writingTarget', 1000),
    type: store.get('writingTargetType', 'words'),
    sessions: store.get('writingSessions', {})
  };

  function renderWritingTarget() {
    $('#writing-target-value').textContent = writingState.target;
    const labels = { words: 'words / day', minutes: 'minutes / day', pages: 'pages / day' };
    $('#writing-target-type-label').textContent = labels[writingState.type];
    $('#writing-target-input').value = writingState.target;
    $('#writing-target-type').value = writingState.type;
    $('#writing-today-target').textContent = writingState.target;
    $('#writing-unit-label').textContent = writingState.type;
  }

  function getTodayWritingTotal() {
    const sessions = writingState.sessions[todayKey()] || [];
    return sessions.reduce((s, x) => s + x.amount, 0);
  }

  function renderWritingProgress() {
    const total = getTodayWritingTotal();
    const pct = Math.min(100, Math.round((total / writingState.target) * 100));
    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (pct / 100) * circumference;
    $('#writing-progress-ring').style.strokeDashoffset = offset;
    $('#writing-progress-pct').textContent = pct + '%';
    $('#writing-today-count').textContent = total;
    renderWritingTarget();
  }

  function renderWritingSessions() {
    const list = $('#writing-session-list');
    const sessions = writingState.sessions[todayKey()] || [];
    if (sessions.length === 0) {
      list.innerHTML = '<p class="empty-state">No sessions logged yet. Start writing!</p>';
      return;
    }
    list.innerHTML = sessions.map((s, i) => `
      <div class="session-item pop-in">
        <div class="session-info">
          <span class="session-amount">${s.amount} ${writingState.type}</span>
          <span class="session-time">${s.time}</span>
        </div>
        <button class="btn-danger-sm" data-idx="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-danger-sm').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        writingState.sessions[todayKey()].splice(idx, 1);
        store.set('writingSessions', writingState.sessions);
        renderWritingSessions();
        renderWritingProgress();
      });
    });
  }

  $('#edit-writing-target').addEventListener('click', () => {
    $('#writing-target-display').classList.toggle('hidden');
    $('#writing-target-edit').classList.toggle('hidden');
  });

  $('#save-writing-target').addEventListener('click', () => {
    const val = parseInt($('#writing-target-input').value);
    if (!val || val < 1) return;
    writingState.target = val;
    writingState.type = $('#writing-target-type').value;
    store.set('writingTarget', writingState.target);
    store.set('writingTargetType', writingState.type);
    $('#writing-target-display').classList.remove('hidden');
    $('#writing-target-edit').classList.add('hidden');
    renderWritingProgress();
  });

  $('#log-writing-session').addEventListener('click', () => {
    const amount = parseInt($('#writing-session-amount').value);
    if (!amount || amount < 1) return;
    const key = todayKey();
    if (!writingState.sessions[key]) writingState.sessions[key] = [];
    writingState.sessions[key].push({
      amount,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
    store.set('writingSessions', writingState.sessions);
    $('#writing-session-amount').value = '';
    renderWritingSessions();
    renderWritingProgress();
  });

  renderWritingProgress();
  renderWritingSessions();

  // ===================== DAILY ACHIEVEMENT GOALS =====================
  const goalState = {
    goals: store.get('dailyGoals', []),
    checked: store.get('dailyChecked', {}),
    streakData: store.get('achievementStreak', { count: 0, lastDate: null })
  };

  function renderGoalsList() {
    const list = $('#goals-list');
    if (goalState.goals.length === 0) {
      list.innerHTML = '<p class="empty-state">No goals yet. Add your first one above!</p>';
      return;
    }
    list.innerHTML = goalState.goals.map(g => `
      <div class="goal-item">
        <span class="goal-text">${escapeHtml(g.text)}</span>
        <button class="btn-danger-sm" data-id="${g.id}" title="Remove">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-danger-sm').forEach(btn => {
      btn.addEventListener('click', () => {
        goalState.goals = goalState.goals.filter(g => g.id !== btn.dataset.id);
        store.set('dailyGoals', goalState.goals);
        renderGoalsList();
        renderDailyChecklist();
      });
    });
  }

  function renderDailyChecklist() {
    const cl = $('#daily-checklist');
    const key = todayKey();
    const checked = goalState.checked[key] || [];

    if (goalState.goals.length === 0) {
      cl.innerHTML = '<p class="empty-state">Define some goals first!</p>';
      $('#achievements-progress-bar').style.width = '0%';
      $('#achievements-progress-label').textContent = '0 / 0 completed';
      return;
    }

    cl.innerHTML = goalState.goals.map(g => {
      const done = checked.includes(g.id);
      return `
        <div class="checklist-item${done ? ' checked' : ''}" data-id="${g.id}">
          <div class="checklist-checkbox">${checkSvg}</div>
          <span class="checklist-label">${escapeHtml(g.text)}</span>
        </div>`;
    }).join('');

    cl.querySelectorAll('.checklist-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const key2 = todayKey();
        if (!goalState.checked[key2]) goalState.checked[key2] = [];
        const arr = goalState.checked[key2];
        if (arr.includes(id)) {
          goalState.checked[key2] = arr.filter(x => x !== id);
        } else {
          goalState.checked[key2].push(id);
        }
        store.set('dailyChecked', goalState.checked);
        renderDailyChecklist();
        updateAchievementStreak();
      });
    });

    const pct = Math.round((checked.length / goalState.goals.length) * 100);
    $('#achievements-progress-bar').style.width = pct + '%';
    $('#achievements-progress-label').textContent = `${checked.length} / ${goalState.goals.length} completed`;
  }

  function updateAchievementStreak() {
    const key = todayKey();
    const checked = goalState.checked[key] || [];
    const allDone = goalState.goals.length > 0 && checked.length >= goalState.goals.length;

    if (allDone) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      if (goalState.streakData.lastDate === key) {
        // already counted today
      } else if (goalState.streakData.lastDate === yKey || goalState.streakData.count === 0) {
        goalState.streakData.count++;
        goalState.streakData.lastDate = key;
      } else {
        goalState.streakData.count = 1;
        goalState.streakData.lastDate = key;
      }
    }
    store.set('achievementStreak', goalState.streakData);
    $('#achievement-streak').textContent = goalState.streakData.count;
  }

  $('#add-goal-btn').addEventListener('click', () => {
    const inp = $('#new-goal-input');
    const text = inp.value.trim();
    if (!text) return;
    goalState.goals.push({ id: Date.now().toString(36), text });
    store.set('dailyGoals', goalState.goals);
    inp.value = '';
    renderGoalsList();
    renderDailyChecklist();
  });

  $('#new-goal-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#add-goal-btn').click();
  });

  renderGoalsList();
  renderDailyChecklist();
  updateAchievementStreak();

  // ===================== CALENDAR =====================
  let calYear = now.getFullYear();
  let calMonth = now.getMonth();
  const calNotes = store.get('calendarNotes', {});

  function renderCalendar() {
    const grid = $('#calendar-grid');
    grid.querySelectorAll('.cal-day').forEach(d => d.remove());

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    $('#cal-month-year').textContent = `${monthNames[calMonth]} ${calYear}`;

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth, 0).getDate();
    const todayStr = todayKey();

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const div = document.createElement('div');
      div.className = 'cal-day other-month';
      div.textContent = d;
      grid.appendChild(div);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const div = document.createElement('div');
      div.className = 'cal-day';
      if (dateStr === todayStr) div.classList.add('today');
      if (calNotes[dateStr]) div.classList.add('has-note');
      div.textContent = d;
      div.addEventListener('click', () => openCalModal(dateStr));
      grid.appendChild(div);
    }

    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      const div = document.createElement('div');
      div.className = 'cal-day other-month';
      div.textContent = i;
      grid.appendChild(div);
    }
  }

  function openCalModal(dateStr) {
    $('#cal-modal-overlay').classList.remove('hidden');
    $('#cal-modal-date').textContent = formatDate(dateStr);
    $('#cal-note-input').value = calNotes[dateStr] || '';
    $('#cal-modal-overlay').dataset.date = dateStr;

    const summary = [];
    const ws = writingState.sessions[dateStr];
    if (ws && ws.length) summary.push(`📝 ${ws.reduce((s, x) => s + x.amount, 0)} ${writingState.type} written`);

    const gc = goalState.checked[dateStr];
    if (gc && gc.length) summary.push(`✅ ${gc.length} goal(s) completed`);

    const tt = store.get('threeThings', {})[dateStr];
    if (tt) {
      const done = tt.filter(t => t.done).length;
      summary.push(`⭐ ${done}/3 things done`);
    }

    const workouts = (store.get('fitnessWorkouts', {})[dateStr] || []);
    if (workouts.length) summary.push(`💪 ${workouts.length} workout(s)`);

    const summaryEl = $('#cal-day-summary');
    summaryEl.innerHTML = summary.length
      ? '<h3 style="font-size:0.9rem;margin-bottom:8px;color:var(--text-secondary)">Activity Summary</h3>' + summary.map(s => `<div style="padding:4px 0;font-size:0.88rem;">${s}</div>`).join('')
      : '<p class="empty-state" style="padding:12px 0;">No activity logged for this day.</p>';
  }

  $('#cal-modal-close').addEventListener('click', () => {
    $('#cal-modal-overlay').classList.add('hidden');
  });

  $('#cal-modal-overlay').addEventListener('click', e => {
    if (e.target === $('#cal-modal-overlay')) $('#cal-modal-overlay').classList.add('hidden');
  });

  $('#cal-save-note').addEventListener('click', () => {
    const dateStr = $('#cal-modal-overlay').dataset.date;
    const note = $('#cal-note-input').value.trim();
    if (note) {
      calNotes[dateStr] = note;
    } else {
      delete calNotes[dateStr];
    }
    store.set('calendarNotes', calNotes);
    renderCalendar();
    $('#cal-modal-overlay').classList.add('hidden');
  });

  $('#cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });

  $('#cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  renderCalendar();

  // ===================== 3 THINGS TODAY =====================
  const threeThings = store.get('threeThings', {});

  function renderThreeThings() {
    const key = todayKey();
    const today = threeThings[key];

    if (today) {
      $('#three-things-inputs').classList.add('hidden');
      const list = $('#three-things-list');
      const ranks = ['Essential', 'Important', 'Important'];
      list.innerHTML = today.map((t, i) => `
        <div class="thing-item${t.done ? ' done' : ''}" data-idx="${i}">
          <div class="thing-checkbox">${checkSvg}</div>
          <span class="thing-text">${escapeHtml(t.text)}</span>
          <span class="thing-rank">${ranks[i]}</span>
        </div>
      `).join('') + `<button class="btn btn-secondary" id="reset-three-things" style="margin-top:12px;align-self:flex-start;">Reset Today</button>`;

      list.querySelectorAll('.thing-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.idx);
          threeThings[key][idx].done = !threeThings[key][idx].done;
          store.set('threeThings', threeThings);
          renderThreeThings();
        });
      });

      const resetBtn = list.querySelector('#reset-three-things');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          delete threeThings[key];
          store.set('threeThings', threeThings);
          renderThreeThings();
        });
      }
    } else {
      $('#three-things-inputs').classList.remove('hidden');
      $('#three-things-list').innerHTML = '';
    }
  }

  function renderThreeThingsArchive() {
    const archive = $('#three-things-archive');
    const key = todayKey();
    const dates = Object.keys(threeThings).filter(d => d !== key).sort().reverse().slice(0, 14);
    if (dates.length === 0) {
      archive.innerHTML = '<p class="empty-state">No past entries yet.</p>';
      return;
    }
    archive.innerHTML = dates.map(d => {
      const items = threeThings[d];
      return `<div class="archive-day">
        <div class="archive-day-header">${formatDate(d)}</div>
        <div class="archive-day-items">
          ${items.map(t => `<div class="archive-thing${t.done ? ' was-done' : ''}">${t.done ? '✓ ' : '○ '}${escapeHtml(t.text)}</div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  $('#save-three-things').addEventListener('click', () => {
    const t1 = $('#thing-1').value.trim();
    const t2 = $('#thing-2').value.trim();
    const t3 = $('#thing-3').value.trim();
    if (!t1 || !t2 || !t3) return;
    threeThings[todayKey()] = [
      { text: t1, done: false },
      { text: t2, done: false },
      { text: t3, done: false }
    ];
    store.set('threeThings', threeThings);
    $('#thing-1').value = '';
    $('#thing-2').value = '';
    $('#thing-3').value = '';
    renderThreeThings();
    renderThreeThingsArchive();
  });

  renderThreeThings();
  renderThreeThingsArchive();

  // ===================== FITNESS TRACKER =====================
  const defaultExercises = ['Running', 'Weight Training', 'Cycling', 'Swimming', 'Yoga', 'HIIT', 'Walking'];
  const fitnessState = {
    exerciseTypes: store.get('fitnessExerciseTypes', defaultExercises),
    workouts: store.get('fitnessWorkouts', {}),
    streakData: store.get('fitnessStreak', { count: 0, lastDate: null })
  };

  function renderExerciseSelect() {
    const sel = $('#workout-type');
    sel.innerHTML = fitnessState.exerciseTypes.map(t => `<option value="${t}">${t}</option>`).join('')
      + '<option value="__custom__">+ Custom…</option>';
  }

  function renderExerciseTypesList() {
    const list = $('#exercise-types-list');
    list.innerHTML = fitnessState.exerciseTypes.map(t => `
      <span class="tag">${escapeHtml(t)} <button class="tag-remove" data-type="${escapeHtml(t)}" title="Remove">×</button></span>
    `).join('');

    list.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        fitnessState.exerciseTypes = fitnessState.exerciseTypes.filter(t => t !== btn.dataset.type);
        store.set('fitnessExerciseTypes', fitnessState.exerciseTypes);
        renderExerciseTypesList();
        renderExerciseSelect();
      });
    });
  }

  $('#workout-type').addEventListener('change', () => {
    const v = $('#workout-type').value;
    $('#custom-exercise-group').style.display = v === '__custom__' ? '' : 'none';
  });

  $('#add-exercise-type-btn').addEventListener('click', () => {
    const inp = $('#new-exercise-type');
    const name = inp.value.trim();
    if (!name || fitnessState.exerciseTypes.includes(name)) return;
    fitnessState.exerciseTypes.push(name);
    store.set('fitnessExerciseTypes', fitnessState.exerciseTypes);
    inp.value = '';
    renderExerciseTypesList();
    renderExerciseSelect();
  });

  $('#new-exercise-type').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#add-exercise-type-btn').click();
  });

  function logWorkout() {
    let type = $('#workout-type').value;
    if (type === '__custom__') {
      type = $('#custom-exercise-name').value.trim();
      if (!type) return;
      if (!fitnessState.exerciseTypes.includes(type)) {
        fitnessState.exerciseTypes.push(type);
        store.set('fitnessExerciseTypes', fitnessState.exerciseTypes);
        renderExerciseTypesList();
        renderExerciseSelect();
      }
    }
    const duration = parseInt($('#workout-duration').value);
    if (!duration || duration < 1) return;
    const notes = $('#workout-notes').value.trim();
    const key = todayKey();
    if (!fitnessState.workouts[key]) fitnessState.workouts[key] = [];
    fitnessState.workouts[key].push({
      type,
      duration,
      notes,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
    store.set('fitnessWorkouts', fitnessState.workouts);
    $('#workout-duration').value = '';
    $('#workout-notes').value = '';
    $('#custom-exercise-name').value = '';
    $('#custom-exercise-group').style.display = 'none';
    renderWorkoutList();
    renderFitnessChart();
    updateFitnessStreak();
  }

  $('#log-workout-btn').addEventListener('click', logWorkout);

  function renderWorkoutList() {
    const list = $('#workout-list');
    const key = todayKey();
    const workouts = fitnessState.workouts[key] || [];
    if (workouts.length === 0) {
      list.innerHTML = '<p class="empty-state">No workouts logged yet. Let\'s get moving!</p>';
      return;
    }
    list.innerHTML = workouts.map((w, i) => `
      <div class="workout-item pop-in">
        <div class="workout-info">
          <span class="workout-type-label">${escapeHtml(w.type)}</span>
          <span class="workout-detail">${w.duration} min · ${w.time}${w.notes ? ' · ' + escapeHtml(w.notes) : ''}</span>
        </div>
        <button class="btn-danger-sm" data-idx="${i}" title="Remove">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-danger-sm').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        fitnessState.workouts[key].splice(idx, 1);
        if (fitnessState.workouts[key].length === 0) delete fitnessState.workouts[key];
        store.set('fitnessWorkouts', fitnessState.workouts);
        renderWorkoutList();
        renderFitnessChart();
        updateFitnessStreak();
      });
    });
  }

  function renderFitnessChart() {
    const chart = $('#fitness-bar-chart');
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);

    const weekData = [];
    let maxMin = 0;
    let totalMin = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const workouts = fitnessState.workouts[key] || [];
      const mins = workouts.reduce((s, w) => s + w.duration, 0);
      weekData.push({ label: dayLabels[i], mins, isToday: i === dayOfWeek });
      if (mins > maxMin) maxMin = mins;
      totalMin += mins;
    }

    const maxH = 130;
    chart.innerHTML = weekData.map(d => {
      const h = maxMin > 0 ? Math.max(4, (d.mins / maxMin) * maxH) : 4;
      return `
        <div class="bar-col">
          <span class="bar-value">${d.mins > 0 ? d.mins + 'm' : ''}</span>
          <div class="bar" style="height:${h}px;${d.isToday ? 'opacity:1;' : 'opacity:0.55;'}"></div>
          <span class="bar-label" style="${d.isToday ? 'color:var(--accent-1);' : ''}">${d.label}</span>
        </div>`;
    }).join('');

    $('#fitness-week-minutes').textContent = totalMin;
  }

  function updateFitnessStreak() {
    const key = todayKey();
    const hasToday = (fitnessState.workouts[key] || []).length > 0;

    if (hasToday) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      if (fitnessState.streakData.lastDate === key) {
        // already counted
      } else if (fitnessState.streakData.lastDate === yKey || fitnessState.streakData.count === 0) {
        fitnessState.streakData.count++;
        fitnessState.streakData.lastDate = key;
      } else {
        fitnessState.streakData.count = 1;
        fitnessState.streakData.lastDate = key;
      }
    }
    store.set('fitnessStreak', fitnessState.streakData);
    $('#fitness-streak').textContent = fitnessState.streakData.count;
  }

  renderExerciseSelect();
  renderExerciseTypesList();
  renderWorkoutList();
  renderFitnessChart();
  updateFitnessStreak();

  // ===================== UTILITY =====================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
