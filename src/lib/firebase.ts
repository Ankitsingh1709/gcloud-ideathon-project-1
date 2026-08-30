import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAX1MxQkSL0T8VgYFVTNfFIi4ON9btNI-M",
  authDomain: "lab1-rag-project.firebaseapp.com",
  projectId: "lab1-rag-project",
  storageBucket: "lab1-rag-project.firebasestorage.app",
  messagingSenderId: "202050000797",
  appId: "1:202050000797:web:67ab6653543181126a0174"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with the custom database ID provisioned by Firebase setup
const customDbId = "ai-studio-aijournalreflect-efe71797-fc66-4416-b95f-482b5b1daee6";
export const db = getFirestore(app, customDbId);
