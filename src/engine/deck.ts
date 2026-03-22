export interface DeckState {
  drawPile: string[];
  hand: string[];
  discardPile: string[];
}

export function createDeck(cardIds: string[]): DeckState {
  return { drawPile: shuffle([...cardIds]), hand: [], discardPile: [] };
}

export function drawCards(deck: DeckState, count: number, maxHandSize = 5): DeckState {
  const drawPile = [...deck.drawPile];
  const hand = [...deck.hand];
  let discardPile = [...deck.discardPile];
  for (let i = 0; i < count; i++) {
    if (hand.length >= maxHandSize) break;
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break;
      drawPile.push(...shuffle(discardPile));
      discardPile = [];
    }
    hand.push(drawPile.pop()!);
  }
  return { drawPile, hand, discardPile };
}

export function discardHand(deck: DeckState): DeckState {
  return { drawPile: [...deck.drawPile], hand: [], discardPile: [...deck.discardPile, ...deck.hand] };
}

export function discardCard(deck: DeckState, cardId: string): DeckState {
  const handIndex = deck.hand.indexOf(cardId);
  if (handIndex === -1) return deck;
  const hand = [...deck.hand];
  hand.splice(handIndex, 1);
  return { drawPile: [...deck.drawPile], hand, discardPile: [...deck.discardPile, cardId] };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
