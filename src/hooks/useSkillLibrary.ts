import { useState, useEffect, useCallback } from 'react';
import { get, set } from 'idb-keyval';

export interface Skill {
  id: string;
  name: string;
  description: string;
  logic: string; // The "how-to" or prompt part
  category?: string;
  parameters?: {
    name: string;
    description: string;
    type: 'string' | 'number' | 'boolean';
    default?: any;
  }[];
  createdAt: number;
  updatedAt: number;
}

const SKILLS_STORAGE_KEY = 'autocad_ai_skills_library';

export function useSkillLibrary() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadSkills = async () => {
      try {
        const stored = await get<Skill[]>(SKILLS_STORAGE_KEY);
        if (stored) {
          setSkills(stored);
        }
      } catch (err) {
        console.error('Failed to load skills library', err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadSkills();
  }, []);

  const saveSkills = useCallback(async (newSkills: Skill[]) => {
    setSkills(newSkills);
    try {
      await set(SKILLS_STORAGE_KEY, newSkills);
    } catch (err) {
      console.error('Failed to save skills library', err);
    }
  }, []);

  const addSkill = useCallback((skill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newSkill: Skill = {
      ...skill,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newSkill, ...skills];
    saveSkills(updated);
    return newSkill;
  }, [skills, saveSkills]);

  const updateSkill = useCallback((id: string, updates: Partial<Skill>) => {
    const updated = skills.map(s => s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s);
    saveSkills(updated);
  }, [skills, saveSkills]);

  const deleteSkill = useCallback((id: string) => {
    const updated = skills.filter(s => s.id !== id);
    saveSkills(updated);
  }, [skills, saveSkills]);

  return {
    skills,
    isLoaded,
    addSkill,
    updateSkill,
    deleteSkill
  };
}
