import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, set, get, push, update, onValue, child } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAo-nfjs9lEUOJbN8k__YWE-cFj3GBTbts",
  authDomain: "smart-attendance-cf1bb.firebaseapp.com",
  projectId: "smart-attendance-cf1bb",
  storageBucket: "smart-attendance-cf1bb.firebasestorage.app",
  messagingSenderId: "625924538494",
  appId: "1:625924538494:web:19574af5f71c6c9c01182f",
  measurementId: "G-TK6W51TXTP",
  // Crucial addition: The Realtime Database URL you created!
  databaseURL: "https://smart-attendance-cf1bb-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, push, update, onValue, child };
