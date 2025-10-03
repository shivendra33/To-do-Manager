/* Enhanced To-Do App
   - Local storage persistence
   - Due dates & reminder (Notification API if permitted)
   - Priority (High/Medium/Low) with badges
   - Subtasks with per-task progress
   - Overall progress bar
   - Drag & drop reordering
   - Filters / sort / search
   - Theme persisted
*/

(() => {
  const STORAGE_KEY = 'mytasks.v2';
  const taskForm = document.getElementById('task-form');
  const input = document.getElementById('task-input');
  const categorySel = document.getElementById('task-category');
  const dateInput = document.getElementById('task-date');
  const prioritySel = document.getElementById('task-priority');
  const taskListEl = document.getElementById('task-list');
  const template = document.getElementById('task-template');
  const emptyEl = document.getElementById('empty');

  // Controls
  const searchEl = document.getElementById('search');
  const filterStatus = document.getElementById('filter-status');
  const filterCategory = document.getElementById('filter-category');
  const sortBy = document.getElementById('sort-by');
  const overallFill = document.querySelector('.progress-fill');
  const progressText = document.getElementById('progress-text');
  const themeToggle = document.getElementById('theme-toggle');

  // Data
  let tasks = [];

  // Helpers
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  const load = () => {
    try {
      tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { tasks = []; }
  };

  // Theme persistence
  const THEME_KEY = 'mytasks.theme';
  function initTheme() {
    const t = localStorage.getItem(THEME_KEY) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.body.classList.toggle('dark', t === 'dark');
    themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  });

  // Notification permission (for reminders)
  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') Notification.requestPermission();
  }
  requestNotificationPermission();

  // Reminder scheduling (simple: checks upcoming every load)
  function scheduleReminders() {
    if (!('Notification' in window)) return;
    const now = Date.now();
    tasks.forEach(task => {
      if (!task.due || task.reminded) return;
      const due = new Date(task.due).getTime();
      // Remind 30 minutes before if due and in the future and within 24 hours
      const remindAt = due - (30 * 60 * 1000);
      if (remindAt > now && remindAt - now < 24 * 3600 * 1000) {
        setTimeout(() => {
          if (Notification.permission === 'granted' && !task.completed) {
            new Notification('Task reminder', { body: `${task.text} — due ${new Date(task.due).toLocaleString()}` });
          }
        }, remindAt - now);
        task.reminded = true;
      } else if (remindAt <= now && due > now && !task.reminded) {
        // If the remind time already passed but still before due, notify now
        if (Notification.permission === 'granted' && !task.completed) {
          new Notification('Task due soon', { body: `${task.text} — due ${new Date(task.due).toLocaleString()}` });
        }
        task.reminded = true;
      }
    });
    save();
  }

  // Compute overall progress - percent of completed subtasks/tasks
  function computeOverallProgress() {
    if (!tasks.length) {
      overallFill.style.width = '0%';
      progressText.textContent = '0%';
      return;
    }
    let total = 0, done = 0;
    tasks.forEach(t => {
      if (t.subtasks && t.subtasks.length) {
        total += t.subtasks.length;
        done += t.subtasks.filter(s => s.done).length;
      } else {
        total += 1;
        done += t.completed ? 1 : 0;
      }
    });
    const pct = total === 0 ? 0 : Math.round((done/total)*100);
    overallFill.style.width = pct + '%';
    progressText.textContent = pct + '%';
  }

  // Render
  function render() {
    taskListEl.innerHTML = '';
    const filtered = applyFilters(tasks);
    if (filtered.length === 0) {
      emptyEl.style.display = 'flex';
    } else {
      emptyEl.style.display = 'none';
    }
    filtered.forEach(task => {
      const node = createTaskNode(task);
      taskListEl.appendChild(node);
    });
    computeOverallProgress();
  }

  function applyFilters(list) {
    const q = (searchEl.value || '').trim().toLowerCase();
    let filtered = list.slice();

    // search
    if (q) filtered = filtered.filter(t => t.text.toLowerCase().includes(q) || (t.subtasks && t.subtasks.some(s => s.text.toLowerCase().includes(q))));

    // status
    const status = filterStatus.value;
    const now = Date.now();
    if (status === 'pending') filtered = filtered.filter(t => !t.completed);
    else if (status === 'completed') filtered = filtered.filter(t => t.completed);
    else if (status === 'overdue') filtered = filtered.filter(t => t.due && new Date(t.due).getTime() < now && !t.completed);

    // category
    const cat = filterCategory.value;
    if (cat !== 'all') filtered = filtered.filter(t => t.category === cat);

    // sort
    const s = sortBy.value;
    if (s === 'created_desc') filtered.sort((a,b)=> b.created - a.created);
    else if (s === 'date_asc') filtered.sort((a,b)=> (a.due||Infinity) - (b.due||Infinity));
    else if (s === 'date_desc') filtered.sort((a,b)=> (b.due||0) - (a.due||0));
    else if (s === 'priority_desc') {
      const p = { 'High':3, 'Medium':2, 'Low':1 };
      filtered.sort((a,b)=> (p[b.priority]||0) - (p[a.priority]||0));
    }
    return filtered;
  }

  // Create DOM task from template
  function createTaskNode(task) {
    const tpl = template.content.cloneNode(true);
    const li = tpl.querySelector('li');
    li.dataset.id = task.id;

    // left
    const checkBtn = li.querySelector('.check');
    const titleEl = li.querySelector('.title');
    const categoryEl = li.querySelector('.badge.category');
    const priorityEl = li.querySelector('.badge.priority');
    const dueEl = li.querySelector('.due');
    const createdEl = li.querySelector('.created');

    // right
    const progressFill = li.querySelector('.task-progress-fill');
    const expandBtn = li.querySelector('.expand');
    const editBtn = li.querySelector('.edit');
    const deleteBtn = li.querySelector('.delete');
    const expandPanel = li.querySelector('.expand-panel');
    const subtaskList = li.querySelector('.subtask-list');
    const subtaskInput = li.querySelector('.subtask-input');
    const addSubBtn = li.querySelector('.add-sub');

    // data populate
    titleEl.textContent = task.text;
    categoryEl.textContent = task.category || 'General';
    categoryEl.classList.add('category');
    // priority
    priorityEl.textContent = task.priority;
    priorityEl.classList.add('priority');
    priorityEl.classList.add(task.priority.toLowerCase());

    // due
    if (task.due) {
      const dueDate = new Date(task.due);
      const today = new Date(); today.setHours(0,0,0,0);
      dueEl.textContent = dueDate.toLocaleDateString();
      if (new Date(task.due).getTime() < Date.now() && !task.completed) {
        dueEl = li.querySelector('.due'); // ensure var
        li.querySelector('.title-wrap').querySelector('.due').style.color = 'var(--danger)';
      }
    } else {
      li.querySelector('.title-wrap').querySelector('.due').textContent = '';
    }

    createdEl.textContent = `Created ${new Date(task.created).toLocaleString()}`;

    // set complete state
    if (task.completed) {
      li.classList.add('completed');
      checkBtn.classList.add('completed');
    }

    // subtasks render
    function renderSubtasks() {
      subtaskList.innerHTML = '';
      if (!task.subtasks) task.subtasks = [];
      task.subtasks.forEach((s, idx) => {
        const item = document.createElement('li');
        item.className = 'subtask';
        item.innerHTML = `
          <button class="subcheck ${s.done? 'checked':''}" data-idx="${idx}"></button>
          <div class="subtext" contenteditable="false">${s.text}</div>
          <button class="icon-btn delete-sub" data-idx="${idx}">🗑️</button>
        `;
        // toggle subtask
        item.querySelector('.subcheck').addEventListener('click', (e) => {
          s.done = !s.done;
          save();
          renderSubtasks();
          updateTaskProgress();
          computeOverallProgress();
        });
        // delete subtask
        item.querySelector('.delete-sub').addEventListener('click', () => {
          task.subtasks.splice(idx,1);
          save();
          renderSubtasks();
          updateTaskProgress();
          computeOverallProgress();
        });
        // allow inline edit on subtext
        const subtext = item.querySelector('.subtext');
        subtext.addEventListener('dblclick', ()=> {
          subtext.contentEditable = 'true';
          subtext.focus();
        });
        subtext.addEventListener('blur', ()=> {
          subtext.contentEditable = 'false';
          s.text = subtext.textContent.trim() || s.text;
          save();
        });

        subtaskList.appendChild(item);
      });
      // update task progress bar
      updateTaskProgress();
    }

    function updateTaskProgress() {
      let p = 0;
      if (task.subtasks && task.subtasks.length) {
        const total = task.subtasks.length;
        const done = task.subtasks.filter(x=>x.done).length;
        p = Math.round((done/total)*100);
        // if all subtasks done, mark task complete
        if (done === total && total>0) {
          task.completed = true;
        } else {
          task.completed = false;
        }
      } else {
        p = task.completed ? 100 : 0;
      }
      progressFill.style.width = p + '%';
      // update check state visuals
      if (task.completed) {
        li.classList.add('completed');
        checkBtn.classList.add('completed');
      } else {
        li.classList.remove('completed');
        checkBtn.classList.remove('completed');
      }
      save();
    }

    renderSubtasks();

    // add subtask
    addSubBtn.addEventListener('click', ()=> {
      const text = subtaskInput.value.trim();
      if (!text) return;
      task.subtasks = task.subtasks || [];
      task.subtasks.push({ text, done:false });
      subtaskInput.value = '';
      save();
      renderSubtasks();
      computeOverallProgress();
    });
    subtaskInput.addEventListener('keydown', (e)=> { if (e.key === 'Enter') addSubBtn.click(); });

    // expand panel toggle
    expandBtn.addEventListener('click', ()=> {
      expandPanel.classList.toggle('hidden');
    });

    // toggle complete
    checkBtn.addEventListener('click', ()=> {
      if (task.subtasks && task.subtasks.length) {
        // if subtasks exist, toggling marks all subtasks done/undone
        const allDone = task.subtasks.every(s=>s.done);
        task.subtasks.forEach(s=> s.done = !allDone);
        task.completed = !allDone;
      } else {
        task.completed = !task.completed;
      }
      save();
      renderSubtasks();
      render(); // refresh visuals
    });

    // inline edit for title on dblclick or edit button
    titleEl.addEventListener('dblclick', ()=> {
      titleEl.contentEditable = 'true';
      titleEl.focus();
    });
    titleEl.addEventListener('blur', ()=> {
      titleEl.contentEditable = 'false';
      task.text = titleEl.textContent.trim() || task.text;
      save();
      render();
    });
    editBtn.addEventListener('click', ()=> {
      titleEl.contentEditable = 'true';
      titleEl.focus();
    });

    // delete with animation
    deleteBtn.addEventListener('click', ()=> {
      li.style.opacity = '0'; li.style.transform = 'translateX(14px) scale(.98)';
      setTimeout(()=> {
        tasks = tasks.filter(t => t.id !== task.id);
        save();
        render();
      }, 220);
    });

    // Drag and drop events
    li.addEventListener('dragstart', (e)=> {
      e.dataTransfer.setData('text/plain', task.id);
      li.style.opacity = '0.6';
    });
    li.addEventListener('dragend', ()=> {
      li.style.opacity = '';
    });

    li.addEventListener('dragover', (e)=> {
      e.preventDefault();
      li.style.transform = 'scale(.995)';
    });
    li.addEventListener('dragleave', ()=> {
      li.style.transform = '';
    });
    li.addEventListener('drop', (e)=> {
      e.preventDefault();
      li.style.transform = '';
      const idFrom = e.dataTransfer.getData('text/plain');
      const idTo = task.id;
      if (!idFrom || idFrom === idTo) return;
      reorderTasks(idFrom, idTo);
      save();
      render();
    });

    // due date color highlight
    if (task.due) {
      const dueTime = new Date(task.due).getTime();
      if (dueTime < Date.now() && !task.completed) {
        li.style.border = '1px solid rgba(255,107,107,0.22)';
      }
    }

    // small entrance animation
    requestAnimationFrame(()=> {
      li.style.transform = 'translateY(-8px)';
      li.style.opacity = '0';
      setTimeout(()=> { li.style.transition = 'transform .28s ease, opacity .28s ease'; li.style.transform = ''; li.style.opacity = ''; }, 8);
    });

    return li;
  }

  function reorderTasks(fromId, toId) {
    const fromIdx = tasks.findIndex(t=>t.id === fromId);
    const toIdx = tasks.findIndex(t=>t.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [item] = tasks.splice(fromIdx,1);
    tasks.splice(toIdx, 0, item);
  }

  // Add task handler
  taskForm.addEventListener('submit', (e)=> {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const newTask = {
      id: uid(),
      text,
      category: categorySel.value,
      priority: prioritySel.value,
      due: dateInput.value || null,
      created: Date.now(),
      completed: false,
      subtasks: [],
      reminded: false
    };
    // by default new tasks go to top
    tasks.unshift(newTask);
    save();
    input.value = '';
    dateInput.value = '';
    render();
    scheduleReminders();
  });

  // filters/search events
  [searchEl, filterStatus, filterCategory, sortBy].forEach(el => el.addEventListener('input', render));

  // helper to set sample seed (optional for first run)
  function seedIfEmpty() {
    if (tasks.length) return;
    // small sample tasks
    tasks = [
      { id: uid(), text: 'Finish project report', category:'Work', priority:'High', due: getFutureDate(1), created: Date.now()-2000000, completed:false, subtasks:[{text:'Draft',done:true},{text:'Review',done:false}], reminded:false },
      { id: uid(), text: 'Study OS chapter 4', category:'Study', priority:'Medium', due: getFutureDate(3), created: Date.now()-500000, completed:false, subtasks:[], reminded:false },
      { id: uid(), text: 'Buy groceries', category:'Personal', priority:'Low', due:null, created: Date.now()-100000, completed:false, subtasks:[{text:'Milk',done:false},{text:'Eggs',done:false}], reminded:false }
    ];
    save();
  }
  function getFutureDate(days){ const d = new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }

  // initial load
  function init() {
    initTheme();
    load();
    seedIfEmpty();
    render();
    scheduleReminders();

    // small poller to update overdue states hourly (if app remains open)
    setInterval(()=> { render(); }, 1000*60*60);
  }

  init();
})();
