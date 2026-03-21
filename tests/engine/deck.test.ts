import { describe, it, expect } from 'vitest';
import { createDeck, drawCards, discardHand, discardCard, shuffle } from '@engine/deck';

describe('deck management', () => {
  it('creates a shuffled deck from card IDs', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const deck = createDeck(ids);
    expect(deck.drawPile).toHaveLength(5);
    expect(deck.hand).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(0);
    expect([...deck.drawPile].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('draws cards from draw pile into hand', () => {
    const deck = { drawPile: ['a', 'b', 'c', 'd', 'e'], hand: [] as string[], discardPile: [] as string[] };
    const result = drawCards(deck, 3);
    expect(result.hand).toHaveLength(3);
    expect(result.drawPile).toHaveLength(2);
  });

  it('shuffles discard into draw when draw pile is insufficient', () => {
    const deck = { drawPile: ['a'], hand: [] as string[], discardPile: ['b', 'c', 'd'] };
    const result = drawCards(deck, 3);
    expect(result.hand).toHaveLength(3);
    expect(result.drawPile.length + result.hand.length + result.discardPile.length).toBe(4);
  });

  it('discards entire hand', () => {
    const deck = { drawPile: ['a'], hand: ['b', 'c'], discardPile: ['d'] };
    const result = discardHand(deck);
    expect(result.hand).toHaveLength(0);
    expect(result.discardPile).toEqual(['d', 'b', 'c']);
  });

  it('discards a specific card from hand', () => {
    const deck = { drawPile: [], hand: ['a', 'b', 'c'], discardPile: [] as string[] };
    const result = discardCard(deck, 'b');
    expect(result.hand).toEqual(['a', 'c']);
    expect(result.discardPile).toEqual(['b']);
  });

  it('returns unchanged deck when discarding card not in hand', () => {
    const deck = { drawPile: [], hand: ['a', 'b'], discardPile: [] as string[] };
    const result = discardCard(deck, 'z');
    expect(result.hand).toEqual(['a', 'b']);
  });

  it('draws 0 extra cards when entire deck is in hand', () => {
    const deck = { drawPile: [] as string[], hand: ['a', 'b', 'c'], discardPile: [] as string[] };
    const result = drawCards(deck, 5);
    expect(result.hand).toEqual(['a', 'b', 'c']);
  });

  it('shuffle produces a permutation of the input', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffle(arr);
    expect(result.sort()).toEqual(arr.sort());
    expect(result).toHaveLength(arr.length);
  });

  it('all functions are pure (do not mutate input)', () => {
    const deck = { drawPile: ['a', 'b', 'c'], hand: ['d'], discardPile: ['e'] };
    const origDraw = [...deck.drawPile];
    const origHand = [...deck.hand];
    const origDiscard = [...deck.discardPile];
    drawCards(deck, 2);
    discardHand(deck);
    discardCard(deck, 'd');
    expect(deck.drawPile).toEqual(origDraw);
    expect(deck.hand).toEqual(origHand);
    expect(deck.discardPile).toEqual(origDiscard);
  });
});
