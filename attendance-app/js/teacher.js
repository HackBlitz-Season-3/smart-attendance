import { db, ref, set, get, update, onValue } from './firebase.js';

const encodeEmail = (email) => email.replace(/\./g, ',');

let user = null;
let activeSessionId = null;
let sessionTimer = null;

// DOM Elements
const createClassBtn = document.getElementById('create-class-btn');
const createClassModal = document.getElementById('create-class-modal');
const cancelCreateClass = document.getElementById('cancel-create-class');
const createClassForm = document.getElementById('create-class-form');
const teacherClassesSelect = document.getElementById('teacher-classes-select');
const startSessionBtn = document.getElementById('start-session-btn');
const endSessionBtn = document.getElementById('end-session-btn');
const activeSessionInfo = document.getElementById('active-session-info');
const activeClassName = document.getElementById('active-class-name');
const activeClassCode = document.getElementById('active-class-code');
const sessionCountdown = document.getElementById('session-countdown');

window.addEventListener('authReady', (e) => {
    const { user: currentUser, role } = e.detail;
    if (role === 'teacher') {
        user = currentUser;
        initTeacher();
    }
});

function initTeacher() {
    loadTeacherClasses();
    checkActiveSession();
    
    // Modal controls
    createClassBtn.addEventListener('click', () => createClassModal.classList.add('active'));
    cancelCreateClass.addEventListener('click', () => createClassModal.classList.remove('active'));
    
    // Form submit
    createClassForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const className = document.getElementById('new-class-name').value;
        const submitBtn = createClassForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        
        try {
            await createClass(className);
            createClassModal.classList.remove('active');
            createClassForm.reset();
            await loadTeacherClasses();
        } catch (error) {
            console.error("Error creating class:", error);
            alert("Failed to create class: " + error.message);
        } finally {
            submitBtn.disabled = false;
        }
    });

    // Session controls
    startSessionBtn.addEventListener('click', startSession);
    endSessionBtn.addEventListener('click', endSession);
}

// 1. Create Class
async function createClass(className) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Check if code exists is technically needed, but for hackathon 1/9000 fine
    await set(ref(db, 'classes/' + code), {
        name: className,
        code: code,
        teacherEmail: user.email,
        students: {} // Key-value object for easier RTDB updates
    });
}

// 2. Display Teacher Classes
export async function loadTeacherClasses() {
    if (!user) return;
    
    try {
        const snapshot = await get(ref(db, 'classes'));
        teacherClassesSelect.innerHTML = '<option value="" disabled selected>Select a class</option>';
        
        if (!snapshot.exists()) {
            teacherClassesSelect.innerHTML = '<option value="" disabled selected>No classes found</option>';
            return;
        }

        const allClasses = snapshot.val();
        let found = false;

        Object.keys(allClasses).forEach(key => {
            const data = allClasses[key];
            if (data.teacherEmail === user.email) {
                found = true;
                const option = document.createElement('option');
                option.value = data.code;
                option.textContent = `${data.name} (${data.code})`;
                option.dataset.name = data.name;
                teacherClassesSelect.appendChild(option);
            }
        });

        if (!found) {
            teacherClassesSelect.innerHTML = '<option value="" disabled selected>No classes found</option>';
        }

    } catch (error) {
        console.error("Error loading classes", error);
    }
}

// 3. Start Session
function startSession() {
    const classCode = teacherClassesSelect.value;
    if (!classCode) {
        alert("Please select a class first.");
        return;
    }

    startSessionBtn.disabled = true;
    startSessionBtn.textContent = "Locating...";

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                try {
                    const selectedOption = teacherClassesSelect.options[teacherClassesSelect.selectedIndex];
                    const className = selectedOption.dataset.name;

                    const sessionId = 'sess_' + Date.now();
                    
                    await set(ref(db, 'sessions/' + sessionId), {
                        id: sessionId,
                        classCode: classCode,
                        lat: lat,
                        lon: lon,
                        startTime: Date.now(),
                        duration: 60, // 60 seconds
                        active: true,
                        teacherEmail: user.email
                    });

                    activeSessionId = sessionId;
                    uiSessionActive(className, classCode);
                    startSessionTimer(60);
                } catch (error) {
                    console.error("Error starting session:", error);
                    alert("Failed to start session.");
                } finally {
                    startSessionBtn.disabled = false;
                    startSessionBtn.textContent = "Start Session";
                }
            },
            (error) => {
                console.error("Geolocation error:", error);
                alert("Could not get location. Location permissions are required to start a session.");
                startSessionBtn.disabled = false;
                startSessionBtn.textContent = "Start Session";
            },
            { enableHighAccuracy: true }
        );
    } else {
        alert("Geolocation is not supported by this browser.");
        startSessionBtn.disabled = false;
        startSessionBtn.textContent = "Start Session";
    }
}

// 4. End Session
async function endSession() {
    if (!activeSessionId) return;

    try {
        await update(ref(db, 'sessions/' + activeSessionId), {
            active: false
        });
    } catch (error) {
        console.error("Error ending session", error);
    }
    
    uiSessionInactive();
    if (sessionTimer) clearInterval(sessionTimer);
    activeSessionId = null;
}

// Check active session
async function checkActiveSession() {
    if (!user) return;
    
    try {
        const snapshot = await get(ref(db, 'sessions'));
        if (!snapshot.exists()) return;

        const allSessions = snapshot.val();
        for (let key in allSessions) {
            const data = allSessions[key];
            if (data.teacherEmail === user.email && data.active) {
                // Determine if valid
                const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
                const remaining = data.duration - elapsed;
                
                if (remaining > 0) {
                    activeSessionId = data.id;
                    
                    // Fetch class name
                    let className = data.classCode;
                    const cSnap = await get(ref(db, 'classes/' + data.classCode));
                    if (cSnap.exists()) {
                        className = cSnap.val().name;
                    }

                    uiSessionActive(className, data.classCode);
                    startSessionTimer(remaining);
                    return; // Only support 1 active session
                } else {
                    // It expired, mark false in db
                    update(ref(db, 'sessions/' + key), { active: false });
                }
            }
        }
    } catch (error) {
        console.error("Checking sessions error", error);
    }
}

function startSessionTimer(seconds) {
    if (sessionTimer) clearInterval(sessionTimer);
    
    let rem = seconds;
    sessionCountdown.textContent = `${rem}s remaining`;
    
    sessionTimer = setInterval(() => {
        rem--;
        if (rem <= 0) {
            clearInterval(sessionTimer);
            endSession(); // Auto end session
        } else {
            sessionCountdown.textContent = `${rem}s remaining`;
        }
    }, 1000);
}

function uiSessionActive(className, code) {
    teacherClassesSelect.disabled = true;
    startSessionBtn.style.display = 'none';
    endSessionBtn.style.display = 'inline-flex';
    
    activeClassName.textContent = className;
    activeClassCode.textContent = code;
    activeSessionInfo.style.display = 'flex';
}

function uiSessionInactive() {
    teacherClassesSelect.disabled = false;
    startSessionBtn.style.display = 'inline-flex';
    endSessionBtn.style.display = 'none';
    activeSessionInfo.style.display = 'none';
}