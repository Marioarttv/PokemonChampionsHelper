export type ChampionsLearnsetRecord = {
  speciesId: string;
  moveIds: string[];
};

export type ChampionsLearnsetsData = {
  meta: {
    generatedAt: string;
    source: string;
    regulation: string;
    regulationWindow: string;
    legalSpeciesCount: number;
    learnsetCount: number;
  };
  learnsets: ChampionsLearnsetRecord[];
};

let championsLearnsetsPromise: Promise<ChampionsLearnsetsData> | null = null;

export function loadChampionsLearnsets() {
  if (!championsLearnsetsPromise) {
    const dataUrl = `${import.meta.env.BASE_URL}data/champions-learnsets.json`;

    championsLearnsetsPromise = fetch(dataUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load local Champions learnsets: ${response.status}`);
      }

      return (await response.json()) as ChampionsLearnsetsData;
    });
  }

  return championsLearnsetsPromise;
}
