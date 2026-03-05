export interface HoleQualityRead {
  text: string;
  tone: 'great' | 'good' | 'neutral' | 'bad' | 'reset';
}

export function buildHoleQualityRead(hole: {
  par: number;
  score: number;
  putts?: number | null;
  greenHit?: string | boolean | null;
  fairwayHit?: string | boolean | null;
  approachClub?: string | null;
  greenSideBunker?: boolean;
  fairwayBunker?: boolean;
  upDown?: boolean | null;
  handicapIndex?: number | null;
  playerHandicap?: number | null;
}): HoleQualityRead {
  const diff = hole.score - hole.par;
  const gir = hole.greenHit === true;
  const onePutt = (hole.putts ?? 99) === 1;
  const threePutt = (hole.putts ?? 0) >= 3;
  const bunker = hole.greenSideBunker === true;
  const bunkerSave = bunker && hole.upDown === true;
  const strokeHole =
    hole.playerHandicap != null &&
    hole.handicapIndex != null &&
    hole.handicapIndex <= Math.round(hole.playerHandicap);

  if (diff <= -2) {
    return { text: 'Eagle. One of those holes.', tone: 'great' };
  }

  if (diff === -1) {
    if (gir && onePutt) return { text: 'Birdie. GIR and one putt. As good as it gets.', tone: 'great' };
    if (gir) return { text: 'Birdie. Hit the green, made the putt.', tone: 'great' };
    if (onePutt && !gir) return { text: 'Birdie from off the green. Short game working.', tone: 'great' };
    return { text: 'Birdie.', tone: 'great' };
  }

  if (diff === 0) {
    if (bunkerSave) return { text: 'Par out of the sand. Take it.', tone: 'good' };
    if (!gir && hole.upDown === true) return { text: 'Par from off the green. Scrambling.', tone: 'good' };
    if (gir && threePutt) return { text: 'Par but three putts. Hit the green, did not convert.', tone: 'neutral' };
    if (gir && onePutt) return { text: 'Par. GIR and one putt. Should have been birdie.', tone: 'good' };
    if (gir) return { text: 'Par. Green in regulation.', tone: 'neutral' };
    return { text: 'Par.', tone: 'neutral' };
  }

  if (diff === 1) {
    if (strokeHole) return { text: 'Net par on your stroke hole. Expected result.', tone: 'neutral' };
    if (bunker && hole.upDown === false) return { text: 'Bogey. Could not get it up and down from the sand.', tone: 'bad' };
    if (gir && threePutt) return { text: 'Bogey from a three putt. Hit the green but left it too far.', tone: 'bad' };
    if (!gir && hole.upDown === false) return { text: 'Bogey. Missed green, could not save.', tone: 'neutral' };
    if (gir) return { text: 'Bogey from the green. One putt too many.', tone: 'bad' };
    return { text: 'Bogey.', tone: 'neutral' };
  }

  if (diff === 2) {
    if (strokeHole) return { text: 'Double on your stroke hole. That one hurts.', tone: 'bad' };
    if (hole.fairwayBunker) return { text: 'Double. Fairway bunker started the trouble.', tone: 'bad' };
    if (threePutt) return { text: 'Double. Three putts made it worse than it needed to be.', tone: 'bad' };
    return { text: 'Double. Contain it from here.', tone: 'bad' };
  }

  return { text: 'Move on. One hole.', tone: 'reset' };
}
