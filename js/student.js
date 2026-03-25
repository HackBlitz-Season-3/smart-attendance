import { db, ref, set, get, update, push, onValue } from './firebase.js';

const encodeEmail = (email) => email.replace(/\./g, ',');

let user = null;
let activeSessionForStudent = null;

// DOM Elements
const joinClassForm = document.getElementById('join-class-form');
const classCodeInput = document.getElementById('class-code-input');
const joinError = document.getElementById('join-error');
const studentClassesList = document.getElementById('student-classes-list');
const markAttendanceBtn = document.getElementById('mark-attendance-btn');
const markAttendanceStatus = document.getElementById('mark-attendance-status');

window.addEventListener('authReady', (e) => {
    const { user: currentUser, role } = e.detail;
    if (role === 'student') {
        user = currentUser;
        initStudent();
    }
});

function initStudent() {
    loadStudentClasses();
    
    joinClassForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = classCodeInput.value.trim();
        if (code.length !== 4) {
            showError("Code must be 4 digits.");
            return;
        }

        const submitBtn = joinClassForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        
        try {
            await joinClass(code);
            classCodeInput.value = '';
            await loadStudentClasses();
        } catch (error) {
            showError(error.message);
        } finally {
            submitBtn.disabled = false;
        }
    });

    markAttendanceBtn.addEventListener('click', markAttendance);
}

function showError(msg) {
    joinError.textContent = msg;
    setTimeout(() => joinError.textContent = '', 5000);
}

// 1. Join Class
async function joinClass(code) {
    const classRef = ref(db, 'classes/' + code);
    const snapshot = await get(classRef);

    if (!snapshot.exists()) {
        throw new Error("Class not found.");
    }

    const classData = snapshot.val();
    const students = classData.students || {};
    const encoded = encodeEmail(user.email);

    if (students[encoded]) {
        throw new Error("You are already in this class.");
    }

    // Add student
    await update(ref(db, `classes/${code}/students`), {
        [encoded]: true
    });
}

// 2. Load Joined Classes
export async function loadStudentClasses() {
    if (!user) return;
    
    try {
        const snapshot = await get(ref(db, 'classes'));
        if (!snapshot.exists()) {
            renderEmptyClasses();
            return;
        }

        const allClasses = snapshot.val();
        const myClasses = [];
        const encoded = encodeEmail(user.email);

        Object.keys(allClasses).forEach(key => {
            const data = allClasses[key];
            if (data.students && data.students[encoded]) {
                myClasses.push(data);
            }
        });

        if (myClasses.length === 0) {
            renderEmptyClasses();
            return;
        }

        let html = '';
        let classCodes = [];
        
        myClasses.forEach((data) => {
            classCodes.push(data.code);
            html += `
                <div class="class-item">
                    <div class="class-item-details">
                        <h4>${data.name}</h4>
                        <p>Teacher: ${data.teacherEmail}</p>
                    </div>
                    <div class="class-code-badge">${data.code}</div>
                </div>
            `;
        });
        
        studentClassesList.innerHTML = html;
        checkActiveSessionsForStudent(classCodes);

    } catch(err) {
        console.error("Error loading student classes", err);
    }
}

function renderEmptyClasses() {
    studentClassesList.innerHTML = '<p class="text-muted">You haven\'t joined any classes yet.</p>';
    markAttendanceBtn.disabled = true;
    markAttendanceBtn.textContent = 'No active sessions';
}

async function checkActiveSessionsForStudent(classCodes) {
    activeSessionForStudent = null;
    markAttendanceBtn.disabled = true;
    markAttendanceBtn.textContent = 'Checking sessions...';

    if (classCodes.length === 0) return;

    try {
        const snapshot = await get(ref(db, 'sessions'));
        if (!snapshot.exists()) {
            markAttendanceBtn.disabled = true;
            markAttendanceBtn.textContent = 'No active sessions';
            markAttendanceBtn.className = 'btn btn-outline btn-large';
            return;
        }

        const allSessions = snapshot.val();
        let targetSession = null;

        for (let key in allSessions) {
            const s = allSessions[key];
            if (s.active && classCodes.includes(s.classCode)) {
                
                // Expired check locally
                const elapsed = Math.floor((Date.now() - s.startTime) / 1000);
                if (elapsed <= s.duration) {
                    targetSession = s;
                    break;
                }
            }
        }
        
        if (targetSession) {
            activeSessionForStudent = targetSession;
            markAttendanceBtn.disabled = false;
            markAttendanceBtn.textContent = `Mark Attendance for ${targetSession.classCode}`;
            markAttendanceBtn.className = 'btn btn-success btn-large';
        } else {
            markAttendanceBtn.disabled = true;
            markAttendanceBtn.textContent = 'No active sessions';
            markAttendanceBtn.className = 'btn btn-outline btn-large';
        }
    } catch(error) {
        console.error('Error fetching student sessions', error);
    }
}

// 3. Mark Attendance
function markAttendance() {
    if (!activeSessionForStudent) return;

    markAttendanceBtn.disabled = true;
    markAttendanceBtn.textContent = "Verifying Location...";
    markAttendanceStatus.innerHTML = '';

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const sLat = position.coords.latitude;
                const sLon = position.coords.longitude;
                
                const tLat = activeSessionForStudent.lat;
                const tLon = activeSessionForStudent.lon;

                const distance = getDistance(sLat, sLon, tLat, tLon);
                
                console.log("Teacher Location:", tLat, tLon);
                console.log("Student Location:", sLat, sLon);
                console.log("Distance (KM):", distance);
                
                const threshold = 0.02//0.02 km= 20 meters tolerance
                let status = "Present";
                
                if (distance > threshold) {
                    status = "Suspicious";
                }

                try {
                    // Check if already marked for this session
                    const attSnap = await get(ref(db, 'attendance'));
                    if (attSnap.exists()) {
                        const allAtt = attSnap.val();
                        for (let key in allAtt) {
                            const rec = allAtt[key];
                            if (rec.sessionId === activeSessionForStudent.id && rec.studentEmail === user.email) {
                                markAttendanceStatus.innerHTML = `<span style="color: var(--warning);">Attendance already recorded for this session.</span>`;
                                return;
                            }
                        }
                    }

                    // Push new attendance record
                    const newAttRef = push(ref(db, 'attendance'));
                    await set(newAttRef, {
                        studentEmail: user.email,
                        classCode: activeSessionForStudent.classCode,
                        sessionId: activeSessionForStudent.id,
                        status: status,
                        time: new Date().toISOString()
                    });

                    markAttendanceBtn.textContent = "Attendance Marked!";
                    markAttendanceStatus.innerHTML = `<span style="color: ${status === 'Present' ? 'var(--success)' : 'var(--warning)'}; font-weight: 600;">Status: ${status}</span> ${status === 'Suspicious' ? '<br><small>(Location mismatch detected!)</small>' : ''}`;
                    
                } catch (error) {
                    console.error("Error marking attendance:", error);
                    markAttendanceStatus.innerHTML = `<span style="color: var(--danger);">Failed to mark attendance.</span>`;
                    markAttendanceBtn.disabled = false;
                    markAttendanceBtn.textContent = `Retry Mark Attendance`;
                }
            },
            (error) => {
                console.error("Geolocation error:", error);
                markAttendanceStatus.innerHTML = `<span style="color: var(--danger);">Location required for attendance. Please enable location services.</span>`;
                markAttendanceBtn.disabled = false;
                markAttendanceBtn.textContent = `Mark Attendance for ${activeSessionForStudent.classCode}`;
            },
            { enableHighAccuracy: true }
        );
    } else {
        markAttendanceStatus.innerHTML = `<span style="color: var(--danger);">Geolocation is not supported.</span>`;
    }
}

// Haversine formula (Distance in KM)
function getDistance(lat1, lon1, lat2, lon2) {
  let R = 6371; // Earth radius in KM

  let dLat = (lat2 - lat1) * Math.PI / 180;
  let dLon = (lon2 - lon1) * Math.PI / 180;

  let a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) *
    Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);

  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // distance in KM
}