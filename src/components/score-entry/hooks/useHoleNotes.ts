import { useEffect, useState } from 'react';
import { getHoleNotes, saveHoleNote, type HoleNote } from '../../../services/holeNotesService';
import { logger } from '../../../utils/logger';

export function useHoleNotes(courseId: string, currentHoleNumber: number | null) {
  const [holeNotes, setHoleNotes] = useState<HoleNote[]>([]);
  const [holeNotesExpanded, setHoleNotesExpanded] = useState(false);
  const [holeNoteDraft, setHoleNoteDraft] = useState('');

  useEffect(() => {
    if (!courseId || !currentHoleNumber) return;
    let alive = true;

    getHoleNotes(courseId, currentHoleNumber)
      .then((notes) => {
        if (!alive) return;
        setHoleNotes(notes);
        setHoleNotesExpanded(false);
        setHoleNoteDraft('');
      })
      .catch((error) => logger.warn('Failed to load hole notes', error));

    return () => {
      alive = false;
    };
  }, [courseId, currentHoleNumber]);

  const handleSaveHoleNote = async () => {
    if (!courseId || !currentHoleNumber || !holeNoteDraft.trim()) return;
    try {
      const saved = await saveHoleNote({
        courseId,
        holeNumber: currentHoleNumber,
        text: holeNoteDraft.trim(),
        roundId: null,
        roundDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
      if (!saved) return;
      const notes = await getHoleNotes(courseId, currentHoleNumber);
      setHoleNotes(notes);
      setHoleNoteDraft('');
      setHoleNotesExpanded(true);
    } catch (error) {
      logger.warn('Failed to save hole note', error);
    }
  };

  return {
    holeNotes,
    holeNotesExpanded,
    setHoleNotesExpanded,
    holeNoteDraft,
    setHoleNoteDraft,
    handleSaveHoleNote,
  };
}
