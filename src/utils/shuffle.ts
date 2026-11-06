export const shuffleArray = <T>(items: readonly T[]): T[] => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }

  if (shuffled.length > 1 && shuffled.every((item, index) => item === items[index])) {
    [shuffled[0], shuffled[1]] = [shuffled[1]!, shuffled[0]!];
  }
  return shuffled;
};
