'use strict';

/**
 * Learning State — Primary State mapping (Recall × Retention).
 *
 * Pure, framework-independent function. Maps the Direction of the current
 * Recall pattern and the Direction of the Retention pattern to a Primary State.
 * Returns UNDECIDED for cells that no LOCKED decision covers. It never guesses.
 *
 * Scope: Primary State only. Qualifiers (e.g. weak_transfer), Transfer,
 * Confidence and Challenge are not part of this function.
 */

const DIRECTION = Object.freeze({
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NOT_FORMED: 'not_formed',
});

const PRIMARY_STATE = Object.freeze({
  STABLE: 'stable',
  UNSTABLE: 'unstable',
  NOT_LEARNED: 'not_learned',
  UNDECIDED: 'UNDECIDED',
});

const { POSITIVE, NEGATIVE, NOT_FORMED } = DIRECTION;
const { STABLE, UNSTABLE, NOT_LEARNED, UNDECIDED } = PRIMARY_STATE;

// Key: `${recall}|${retention}`. Basis for each cell is given inline.
const TABLE = Object.freeze({
  // Explicit LOCKs
  [`${POSITIVE}|${POSITIVE}`]: STABLE,      // PD-5F-19
  [`${POSITIVE}|${NOT_FORMED}`]: NOT_LEARNED, // PD-5F-20
  [`${POSITIVE}|${NEGATIVE}`]: NOT_LEARNED, // PD-5F-21
  [`${NOT_FORMED}|${POSITIVE}`]: STABLE,    // PD-5F-13

  // Derived from LOCKs: positive Retention affirmatively establishes formation
  // (PD-5F-12), and PD-5F-11 maps established formation + negative Recall to unstable.
  [`${NEGATIVE}|${POSITIVE}`]: UNSTABLE,    // PD-5F-12 + PD-5F-11

  // Undecided: no LOCK covers these cells. PD-5F-22 forbids inferring
  // "formation not established" from the absence of a confirmed channel, so
  // PD-5F-11's not_learned row cannot be applied to them. Negative Retention
  // has no formation bridge (PD-5F-21 §4).
  [`${NOT_FORMED}|${NOT_FORMED}`]: UNDECIDED,
  [`${NEGATIVE}|${NOT_FORMED}`]: UNDECIDED,
  [`${NOT_FORMED}|${NEGATIVE}`]: UNDECIDED,
  [`${NEGATIVE}|${NEGATIVE}`]: UNDECIDED,
});

const VALID = new Set(Object.values(DIRECTION));

/**
 * @param {'positive'|'negative'|'not_formed'} recallDirection
 * @param {'positive'|'negative'|'not_formed'} retentionDirection
 * @returns {'stable'|'unstable'|'not_learned'|'UNDECIDED'}
 * @throws {TypeError} if either argument is not a known Direction value.
 */
function mapPrimaryState(recallDirection, retentionDirection) {
  if (!VALID.has(recallDirection)) {
    throw new TypeError(`Invalid Recall Direction: ${String(recallDirection)}`);
  }
  if (!VALID.has(retentionDirection)) {
    throw new TypeError(`Invalid Retention Direction: ${String(retentionDirection)}`);
  }
  return TABLE[`${recallDirection}|${retentionDirection}`];
}

module.exports = { mapPrimaryState, DIRECTION, PRIMARY_STATE };
