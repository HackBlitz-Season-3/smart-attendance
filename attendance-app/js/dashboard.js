import { db, ref, onValue, get } from './firebase.js';

// DOM Elements
const body = document.body;

const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menu-toggle');
const menuClose = document.getElementById('menu-close');

if (menuBtn && sidebar && menuClose) {
    menuBtn.addEventListener('click', () => sidebar.classList.add('open'));
    menuClose.addEventListener('click', () => sidebar.classList.remove('open'));
}

const teacherDashboard = document.getElementById('teacher-dashboard');
const teacherClasses = document.getElementById('teacher-classes');
const teacherSessions = document.getElementById('teacher-sessions');
const studentDashboard = document.getElementById('student-dashboard');
const studentClasses = document.getElementById('student-classes');
const studentSessions = document.getElementById('student-sessions');
const userEmailEl = document.getElementById('current-user-email');
const userRoleEl = document.getElementById('current-user-role');

let currentUser = null;
let currentRole = null;

// Auth Ready Listener
window.addEventListener('authReady', (e) => {
    const { user, role } = e.detail;
    currentUser = user;
    currentRole = role;

    // Show dashboard layout
    body.style.display = 'block';
    
    // Set user info
    userEmailEl.textContent = user.email;
    userRoleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

    // Show specific view grids inside the unified layout sections
    if (role === 'teacher') {
        if(teacherDashboard) teacherDashboard.style.display = 'grid';
        if(teacherClasses) teacherClasses.style.display = 'grid';
        if(teacherSessions) teacherSessions.style.display = 'grid';
        
        const createBtn = document.getElementById('create-class-btn');
        if(createBtn) createBtn.style.display = 'inline-flex';

        listenTeacherDashboard();
    } else if (role === 'student') {
        if(studentDashboard) studentDashboard.style.display = 'grid';
        if(studentClasses) studentClasses.style.display = 'grid';
        if(studentSessions) studentSessions.style.display = 'grid';
        
        listenStudentDashboard();
    }

    // Initialize nav highlight
    const activeNav = document.querySelector('.nav-item.active');
    if (window.showSection && activeNav) {
        window.showSection('dashboardSection', activeNav);
    }
});

// --- DASHBOARD STATE VARS ---
let selectedSessionId = null;
let allAttendanceData = [];
let allSessionsData = [];
let enrolledStudentsList = [];
let teacherClassCode = null;

// --- TEACHER DASHBOARD LOGIC (REALTIME) ---
function listenTeacherDashboard() {
    if (!currentUser) return;
    
    const attendanceRef = ref(db, 'attendance');
    const sessionsRef = ref(db, 'sessions');
    
    const teacherClassesSelect = document.getElementById('teacher-classes-select');
    
    const updateDashboard = async () => {
        let classCode = document.getElementById('active-class-code')?.textContent || teacherClassesSelect.value;
        if (!classCode) return;
        teacherClassCode = classCode;

        // Fetch Class Enrolled Students
        try {
            const classSnap = await get(ref(db, 'classes/' + classCode));
            if (classSnap.exists()) {
                const studentsObj = classSnap.val().students || {};
                enrolledStudentsList = Object.keys(studentsObj).map(e => e.replace(/,/g, '.'));
            } else {
                enrolledStudentsList = [];
            }
        } catch(e) { console.error(e); }

        renderTeacherDashboard();
    };

    onValue(attendanceRef, (snapshot) => {
        allAttendanceData = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            for (let k in data) allAttendanceData.push(data[k]);
        }
        updateDashboard();
    });

    onValue(sessionsRef, (snapshot) => {
        allSessionsData = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            for (let k in data) allSessionsData.push(data[k]);
        }
        updateDashboard();
    });

    teacherClassesSelect.addEventListener('change', () => {
        selectedSessionId = null; // reset selection on class change
        updateDashboard();
    });
}

function renderTeacherDashboard() {
    const classSessions = allSessionsData.filter(s => s.classCode === teacherClassCode);
    classSessions.sort((a, b) => b.startTime - a.startTime); // newest first

    const historyList = document.getElementById('session-history-list');
    
    if (classSessions.length === 0) {
        historyList.innerHTML = '<p class="text-muted">No sessions recorded yet.</p>';
        selectedSessionId = null;
    } else {
        if (!selectedSessionId || !classSessions.find(s => s.id === selectedSessionId)) {
            selectedSessionId = classSessions[0].id;
        }

        let cardsHTML = '';
        classSessions.forEach(sess => {
            const date = new Date(sess.startTime);
            const dateStr = date.toLocaleDateString();
            const timeStr = date.toLocaleTimeString();
            const isActiveClass = sess.id === selectedSessionId ? 'active' : '';
            const statusBadge = sess.active ? '<span class="status-badge status-present" style="font-size:0.6rem; padding:0.1rem 0.3rem; margin-left: 0.5rem;">LIVE</span>' : '';
            
            cardsHTML += `
                <div class="session-card ${isActiveClass}" onclick="window.selectSession('${sess.id}')">
                    <h4>${dateStr} <br>${timeStr} ${statusBadge}</h4>
                    <p>ID: ${sess.id.replace('sess_', '')}</p>
                </div>
            `;
        });
        historyList.innerHTML = cardsHTML;
    }

    renderTeacherAttendanceTable();
}

window.selectSession = function(id) {
    selectedSessionId = id;
    renderTeacherDashboard();
};

function renderTeacherAttendanceTable() {
    let presentCount = 0;
    let suspiciousCount = 0;
    let tableHTML = '';
    let alertsHTML = '';
    let attendedStudents = new Set();
    
    if (selectedSessionId) {
        const sessionAttendance = allAttendanceData.filter(a => a.sessionId === selectedSessionId);
        sessionAttendance.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        sessionAttendance.forEach(data => {
            attendedStudents.add(data.studentEmail);

            if (data.status === 'Present') presentCount++;
            if (data.status === 'Suspicious') {
                suspiciousCount++;
                alertsHTML += `
                    <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--danger); padding: 0.75rem; margin-bottom: 0.5rem; border-radius: 4px;">
                        <strong>Suspicious scan</strong> by ${data.studentEmail} at ${new Date(data.time).toLocaleTimeString()}
                    </div>
                `;
            }

            tableHTML += `
                <tr>
                    <td>${data.studentEmail}</td>
                    <td>${data.classCode}</td>
                    <td>${new Date(data.time).toLocaleTimeString()}</td>
                    <td><span class="status-badge status-${data.status.toLowerCase()}">${data.status}</span></td>
                </tr>
            `;
        });

        // Add Absents
        enrolledStudentsList.forEach(student => {
            if (!attendedStudents.has(student)) {
                tableHTML += `
                    <tr>
                        <td>${student}</td>
                        <td>${teacherClassCode}</td>
                        <td>-</td>
                        <td><span class="status-badge status-absent">Absent</span></td>
                    </tr>
                `;
            }
        });
    }

    document.getElementById('teacher-present-count').textContent = presentCount;
    document.getElementById('teacher-suspicious-count').textContent = suspiciousCount;
    
    const tbody = document.getElementById('teacher-attendance-table');
    if (tableHTML === '') {
        if (!selectedSessionId) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">No session specifically selected.</td></tr>';
        } else if (enrolledStudentsList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">No students currently enrolled in this class.</td></tr>';
        }
    } else {
        tbody.innerHTML = tableHTML;
    }

    const alertsContainer = document.getElementById('teacher-alerts');
    if (alertsHTML === '') {
        alertsContainer.innerHTML = '<p class="text-muted">No suspicious activity detected.</p>';
    } else {
        alertsContainer.innerHTML = alertsHTML;
    }
}

// --- STUDENT DASHBOARD LOGIC (REALTIME) ---
function listenStudentDashboard() {
    if (!currentUser) return;

    const attendanceRef = ref(db, 'attendance');
    
    onValue(attendanceRef, (snapshot) => {
        let tableHTML = '';
        
        if (snapshot.exists()) {
            const allAttendance = snapshot.val();
            const myAttendance = [];
            
            for (let key in allAttendance) {
                if (allAttendance[key].studentEmail === currentUser.email) {
                    myAttendance.push(allAttendance[key]);
                }
            }
            
            myAttendance.sort((a, b) => new Date(b.time) - new Date(a.time));

            myAttendance.forEach(data => {
                tableHTML += `
                    <tr>
                        <td>${data.classCode}</td>
                        <td>${new Date(data.time).toLocaleString()}</td>
                        <td><span class="status-badge status-${data.status.toLowerCase()}">${data.status}</span></td>
                    </tr>
                `;
            });
        }

        const tbody = document.getElementById('student-attendance-table');
        if (tableHTML === '') {
            tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-center">No attendance history found.</td></tr>';
        } else {
            tbody.innerHTML = tableHTML;
        }
    });
}