// Configuration
const ACCESS_CODE = "CALENDAR2026"; // Hardcoded for this iteration
const STORAGE_KEY = "leave_calendar_data";

// State
let currentState = {
    isAdmin: sessionStorage.getItem('is_admin') === 'true',
    currentDate: new Date(),
    leaves: []
};

// DOM Elements
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const adminModal = document.getElementById('admin-modal');
const adminLoginTrigger = document.getElementById('admin-login-trigger');
const logoutBtn = document.getElementById('logout-btn');
const closeAdminModal = document.getElementById('close-admin-modal');
const calendarGrid = document.getElementById('calendar-grid');
const calendarHeaderTitle = document.getElementById('calendar-header-title');
const activeLeavesList = document.getElementById('active-leaves-list');
const leaveModal = document.getElementById('leave-modal');
const leaveForm = document.getElementById('leave-form');

// User Colors Map
const userColors = {};
const colorPalette = [
    '#38bdf8', // sky
    '#fb7185', // rose
    '#34d399', // emerald
    '#fbbf24', // amber
    '#818cf8', // indigo
    '#c084fc', // purple
    '#f472b6', // pink
    '#2dd4bf'  // teal
];

function getUserColor(name) {
    if (!name) return colorPalette[0];
    const cleanName = name.trim().toLowerCase();
    if (userColors[cleanName]) return userColors[cleanName];
    
    // Better hash function (DJB2)
    let hash = 5381;
    for (let i = 0; i < cleanName.length; i++) {
        hash = ((hash << 5) + hash) + cleanName.charCodeAt(i);
    }
    const color = colorPalette[Math.abs(hash) % colorPalette.length];
    userColors[cleanName] = color;
    return color;
}

// Initialization
function init() {
    // Show dashboard by default
    updateAuthUI();
    renderCalendar();
    fetchSharedLeaves();
    setupEventListeners();
}

function setupEventListeners() {
    // Admin Login Modal
    adminLoginTrigger.addEventListener('click', () => {
        adminModal.classList.remove('hidden');
    });

    closeAdminModal.addEventListener('click', () => {
        adminModal.classList.add('hidden');
    });

    // Login Form Submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('access-code').value;
        
        if (code === ACCESS_CODE) {
            sessionStorage.setItem('is_admin', 'true');
            currentState.isAdmin = true;
            adminModal.classList.add('hidden');
            updateAuthUI();
            renderCalendar();
            renderActiveLeaves();
        } else {
            loginError.classList.remove('hidden');
        }
    });

    // Logout
    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('is_admin');
        currentState.isAdmin = false;
        updateAuthUI();
        renderCalendar();
        renderActiveLeaves();
    });

    // Calendar Navigation
    document.getElementById('prev-month').addEventListener('click', () => {
        currentState.currentDate.setMonth(currentState.currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        currentState.currentDate.setMonth(currentState.currentDate.getMonth() + 1);
        renderCalendar();
    });

    // Leave Modal
    document.getElementById('add-leave-btn').addEventListener('click', () => {
        leaveModal.classList.remove('hidden');
    });

    document.getElementById('close-modal').addEventListener('click', () => {
        leaveModal.classList.add('hidden');
    });

    // Form Submission
    leaveForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('leave-name').value;
        const startStr = document.getElementById('leave-start').value;
        const endStr = document.getElementById('leave-end').value;
        const type = document.getElementById('leave-type').value;

        // Validation: Only Tue, Wed, Thu
        const startDate = new Date(startStr);
        const endDate = new Date(endStr);
        
        if (!isRangeValid(startDate, endDate)) {
            alert("Editorial Leave can only be taken on weekdays (Mon-Fri). Weekends are not permitted.");
            return;
        }

        const newLeave = {
            id: Date.now(),
            name: name,
            start: startStr,
            end: endStr,
            type: type,
            requiresApproval: containsMonOrFri(startDate, endDate)
        };
        
        if (newLeave.requiresApproval) {
            if (!confirm("Please note: Editorial Leave requests for Mondays or Fridays are subject to approval. Do you wish to proceed?")) {
                return;
            }
        }
        
        currentState.leaves.push(newLeave);
        saveData();
        renderCalendar();
        renderActiveLeaves();
        leaveModal.classList.add('hidden');
        leaveForm.reset();

        submitLeaveToBackend(newLeave);
    });
}

function updateAuthUI() {
    if (currentState.isAdmin) {
        adminLoginTrigger.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        adminLoginTrigger.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
    }
}

function isRangeValid(start, end) {
    let curr = new Date(start);
    const stop = new Date(end);
    
    while (curr <= stop) {
        const day = curr.getDay();
        // Block Sat (6) and Sun (0)
        if (day === 0 || day === 6) {
            return false;
        }
        curr.setDate(curr.getDate() + 1);
    }
    return true;
}

function containsMonOrFri(start, end) {
    let curr = new Date(start);
    const stop = new Date(end);
    
    while (curr <= stop) {
        const day = curr.getDay();
        // 1=Mon, 5=Fri
        if (day === 1 || day === 5) {
            return true;
        }
        curr.setDate(curr.getDate() + 1);
    }
    return false;
}

async function submitLeaveToBackend(leave) {
    console.log("Submitting leave to backend...", leave);
    
    // We will hook this into the Firebase Cloud Functions API
    const API_URL = "/api/submit-editorial-leave";
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leave)
        });
        
        if (response.ok) {
            console.log("Leave recorded and notification sent.");
            // Refresh shared data
            fetchSharedLeaves();
        } else {
            console.error("Failed to send email notification.");
        }
    } catch (error) {
        console.error("Error connecting to notification service:", error);
    }
}

async function deleteLeaveEntry(id) {
    if (!currentState.isAdmin) return;
    if (!confirm("Are you sure you want to delete this leave entry?")) return;

    try {
        const response = await fetch(`/api/delete-editorial-leave/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            console.log("Entry deleted");
            fetchSharedLeaves();
        }
    } catch (error) {
        console.error("Delete failed:", error);
    }
}


async function fetchSharedLeaves() {
    const API_URL = "/api/get-editorial-leaves";
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        if (data.success) {
            currentState.leaves = data.leaves;
            renderCalendar();
            renderActiveLeaves();
        }
    } catch (error) {
        console.error("Error fetching shared leaves:", error);
    }
}

function showDashboard() {
    accessScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    fetchSharedLeaves(); // Load shared data
}

function renderCalendar() {
    const year = currentState.currentDate.getFullYear();
    const month = currentState.currentDate.getMonth();
    
    // Header
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(currentState.currentDate);
    calendarHeaderTitle.textContent = `${monthName} ${year}`;
    
    // Clear previous days (keep headers)
    const dayLabels = Array.from(calendarGrid.querySelectorAll('.day-label'));
    calendarGrid.innerHTML = '';
    dayLabels.forEach(label => calendarGrid.appendChild(label));

    // Get dates
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    // Previous month filler
    for (let i = firstDay - 1; i >= 0; i--) {
        const fillerDate = new Date(year, month - 1, prevMonthDays - i);
        const dayDiv = createDayDiv(prevMonthDays - i, true, fillerDate);
        calendarGrid.appendChild(dayDiv);
    }

    // Current month
    const today = new Date();
    for (let i = 1; i <= daysInMonth; i++) {
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === i;
        const dayDate = new Date(year, month, i);
        const dayDiv = createDayDiv(i, false, dayDate, isToday);
        
        // Find leaves for this day
        const dailyLeaves = currentState.leaves.filter(leave => {
            // Helper to get date at midnight local for comparison
            const getMidnight = (d) => {
                const date = new Date(d);
                if (typeof d === 'string' && d.includes('-')) {
                    // For YYYY-MM-DD strings, manually parse to avoid UTC shift
                    const [y, m, d_part] = d.split('-').map(Number);
                    return new Date(y, m - 1, d_part).getTime();
                }
                date.setHours(0,0,0,0);
                return date.getTime();
            };
            
            const start = getMidnight(leave.start);
            const end = getMidnight(leave.end);
            const target = getMidnight(dayDate);
            
            return target >= start && target <= end;
        });

        dailyLeaves.forEach(leave => {
            const userColor = getUserColor(leave.name);
            const tag = document.createElement('div');
            tag.className = `leave-tag`;
            
            let deleteBtn = '';
            if (currentState.isAdmin) {
                deleteBtn = `<span class="delete-icon" onclick="event.stopPropagation(); deleteLeaveEntry('${leave.id}')" style="margin-left: auto; cursor: pointer; opacity: 0.6;">&times;</span>`;
            }

            tag.innerHTML = `
                <span class="leave-dot" style="background: ${userColor}"></span>
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${leave.name}</span>
                ${deleteBtn}
            `;
            tag.title = `${leave.name} (Editorial Leave)`;
            dayDiv.appendChild(tag);
        });

        calendarGrid.appendChild(dayDiv);
    }
}

function createDayDiv(dayNum, isFiller, date, isToday = false) {
    const div = document.createElement('div');
    div.className = 'calendar-day';
    if (isFiller) div.classList.add('not-current-month');
    if (isToday) div.classList.add('today');
    
    // Add click listener
    if (!isFiller) {
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => {
            openLeaveModalWithDate(date);
        });
    }
    
    const span = document.createElement('span');
    span.textContent = dayNum;
    div.appendChild(span);
    
    return div;
}

function openLeaveModalWithDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    document.getElementById('leave-start').value = formattedDate;
    document.getElementById('leave-end').value = formattedDate;
    leaveModal.classList.remove('hidden');
}

function renderActiveLeaves() {
    activeLeavesList.innerHTML = '';
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const upcomingLeaves = currentState.leaves.filter(leave => {
        const getMidnight = (d) => {
            const date = new Date(d);
            if (typeof d === 'string' && d.includes('-')) {
                const [y, m, d_part] = d.split('-').map(Number);
                return new Date(y, m - 1, d_part).getTime();
            }
            date.setHours(0,0,0,0);
            return date.getTime();
        };

        const start = getMidnight(leave.start);
        const end = getMidnight(leave.end);
        const todayMidnight = getMidnight(today);
        const thirtyDaysLimit = getMidnight(thirtyDaysFromNow);

        // Upcoming if end date is today or later AND start date is within next 30 days
        return end >= todayMidnight && start <= thirtyDaysLimit;
    }).sort((a, b) => new Date(a.start) - new Date(b.start));

    if (upcomingLeaves.length === 0) {
        activeLeavesList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem;">No upcoming leave in the next 30 days.</p>';
        return;
    }

    upcomingLeaves.forEach(leave => {
        const userColor = getUserColor(leave.name);
        const item = document.createElement('div');
        item.className = 'glass-card';
        item.style.padding = '1rem 1rem 1rem 1.5rem';
        item.style.marginBottom = '0.5rem';
        item.style.position = 'relative';
        item.style.overflow = 'hidden';
        
        // Helper to format date for display
        const formatDate = (dateStr) => {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        };

        let deleteBtn = '';
        if (currentState.isAdmin) {
            deleteBtn = `<span class="delete-icon" onclick="deleteLeaveEntry('${leave.id}')" style="position: absolute; top: 0.5rem; right: 0.75rem; cursor: pointer; color: var(--accent); font-size: 1.2rem;">&times;</span>`;
        }

        item.innerHTML = `
            <div class="user-indicator" style="background: ${userColor}"></div>
            <div style="font-weight: 600; color: white; padding-right: 1.5rem;">${leave.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(leave.start)} - ${formatDate(leave.end)}</div>
            ${deleteBtn}
        `;
        activeLeavesList.appendChild(item);
    });
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState.leaves));
}

init();
