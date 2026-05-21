// Firebase configuration for Wedding Expenses Tracker
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBf1xynM2D_aD8eU71aka9boz2lnjNiXe4",
  authDomain: "wedding-tracker-42e8c.firebaseapp.com",
  databaseURL: "https://wedding-tracker-42e8c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "wedding-tracker-42e8c",
  storageBucket: "wedding-tracker-42e8c.firebasestorage.app",
  messagingSenderId: "374986357332",
  appId: "1:374986357332:web:0086100431aa6bdff2cbc1"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
