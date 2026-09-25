import { createContext, useContext } from 'react'

export const StudentSessionContext = createContext(null)
export const useStudentSession = () => useContext(StudentSessionContext)
