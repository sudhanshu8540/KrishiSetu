// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyArDv5Cxszq5k4-EAZh5I4AhpVT9A2xfYU",
  authDomain: "krishisetu-ai-4acfe.firebaseapp.com",
  projectId: "krishisetu-ai-4acfe",
  storageBucket: "krishisetu-ai-4acfe.firebasestorage.app",
  messagingSenderId: "224187074357",
  appId: "1:224187074357:web:dbd9c24752101ae4976e7c",
  measurementId: "G-D73PR5Y8BM"
};

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);