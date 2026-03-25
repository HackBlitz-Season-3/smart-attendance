import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, set, get, push, update, onValue, child } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

// firebaseConfig is globally available from js/config.js

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, push, update, onValue, child };
