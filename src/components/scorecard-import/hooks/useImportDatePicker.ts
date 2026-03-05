import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { formatDateLocal } from '../utils';

interface Params {
  playerDate: string;
  setPlayerDate: React.Dispatch<React.SetStateAction<string>>;
  lockPlayerDate: () => void;
}

const parseDateFromString = (value?: string) => {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export function useImportDatePicker(params: Params) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const playerDateDisplay = useMemo(() => {
    if (!params.playerDate) return '';
    const parsed = parseDateFromString(params.playerDate);
    if (!parsed) return params.playerDate;
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [params.playerDate]);

  const commitSelectedDate = (selected: Date) => {
    const formatted = formatDateLocal(selected);
    params.lockPlayerDate();
    params.setPlayerDate(formatted);
    setTempDate(selected);
  };

  const handleDatePicked = (event: { type: string; nativeEvent?: { timestamp?: number } }, date?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }
    const resolvedDate = date
      || (event.nativeEvent?.timestamp ? new Date(event.nativeEvent.timestamp) : undefined);
    if (!resolvedDate) return;
    setTempDate(resolvedDate);
    if (Platform.OS !== 'ios') {
      commitSelectedDate(resolvedDate);
    }
  };

  const openDatePicker = () => {
    setTempDate(parseDateFromString(params.playerDate));
    setShowDatePicker(true);
  };

  return {
    showDatePicker,
    setShowDatePicker,
    tempDate,
    playerDateDisplay,
    commitSelectedDate,
    handleDatePicked,
    openDatePicker,
  };
}

