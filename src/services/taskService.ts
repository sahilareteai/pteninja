import { db, collection, getDocs, query, where, setDoc, doc, handleFirestoreError, OperationType } from '../firebase';
import { PTETask, PTE_TASKS } from '../types';

const TASKS_COLLECTION = 'tasks';

export const fetchTasksFromFirestore = async (): Promise<PTETask[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, TASKS_COLLECTION));
    const tasks: PTETask[] = [];
    querySnapshot.forEach((doc) => {
      tasks.push(doc.data() as PTETask);
    });
    return tasks;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, TASKS_COLLECTION);
    return [];
  }
};

export const seedTasksToFirestore = async () => {
  try {
    console.log("Seeding tasks to Firestore...");
    for (const task of PTE_TASKS) {
      await setDoc(doc(db, TASKS_COLLECTION, task.id), task);
    }
    console.log("Seeding complete!");
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, TASKS_COLLECTION);
    return false;
  }
};
