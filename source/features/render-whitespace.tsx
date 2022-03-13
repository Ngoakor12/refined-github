import './render-whitespace.css';
import React from 'dom-chef';
import select from 'select-dom';
import delegate from 'delegate-it';
import * as pageDetect from 'github-url-detection';

import features from '.';
import getTextNodes from '../helpers/get-text-nodes';
import onNewComments from '../github-events/on-new-comments';
import {onDiffFileLoad} from '../github-events/on-fragment-load';

// `splitText` is used before and after each whitespace group so a new whitespace-only text node is created. This new node is then wrapped in a <span>
function showWhiteSpacesOn(line: Element): void {
	const shouldAvoidSurroundingSpaces = Boolean(line.closest('.blob-wrapper-embedded')); // #2285
	const textNodesOnThisLine = getTextNodes(line);
	for (const [nodeIndex, textNode] of textNodesOnThisLine.entries()) {
		// `textContent` reads must be cached #2737
		let text = textNode.textContent!;
		if (text.length > 1000) { // #5092
			continue;
		}

		const startingCharacter = shouldAvoidSurroundingSpaces && nodeIndex === 0 ? 1 : 0;
		const skipLastCharacter = shouldAvoidSurroundingSpaces && nodeIndex === textNodesOnThisLine.length - 1;
		const endingCharacter = text.length - 1 - Number(skipLastCharacter);

		// Loop goes in reverse otherwise `splitText`'s `index` parameter needs to keep track of the previous split
		for (let i = endingCharacter; i >= startingCharacter; i--) {
			const thisCharacter = text[i];

			// Exclude irrelevant characters
			if (thisCharacter !== ' ' && thisCharacter !== '\t') {
				continue;
			}

			if (i < text.length - 1) {
				textNode.splitText(i + 1);
			}

			// Find the same character so they can be wrapped together, but stop at `startingCharacter`
			while (text[i - 1] === thisCharacter && !(i === startingCharacter)) {
				i--;
			}

			textNode.splitText(i);

			// Update cached variable here because it just changed
			text = textNode.textContent!;

			textNode.after(
				<span data-rgh-whitespace={thisCharacter === '\t' ? 'tab' : 'space'}>
					{textNode.nextSibling}
				</span>,
			);
		}
	}
}

const viewportObserver = new IntersectionObserver(changes => {
	for (const change of changes) {
		if (change.isIntersecting) {
			showWhiteSpacesOn(change.target);
			viewportObserver.unobserve(change.target);
		}
	}
});

// eslint-disable-next-line import/prefer-default-export
export const codeElementsSelectors = [
	'.blob-code-inner', // Code lines
	'.highlight > pre', // Highlighted code blocks in comments
	'.snippet-clipboard-content > pre', // Not highlighted code blocks in comments
].join(',');

function observeWhiteSpace(): void {
	for (const line of select.all(`:is(${codeElementsSelectors}):not(.rgh-observing-whitespace, .blob-code-hunk)`)) {
		line.classList.add('rgh-observing-whitespace');
		viewportObserver.observe(line);
	}
}

function init(): void {
	observeWhiteSpace();
	// Show whitespace on new review suggestions #2852
	// This event is not very reliable as it also triggers when review comments are edited or deleted
	delegate(document, '.js-pull-refresh-on-pjax', 'socket:message', observeWhiteSpace, {capture: true});
}

void features.add(import.meta.url, {
	include: [
		pageDetect.hasCode,
	],
	additionalListeners: [
		onNewComments,
		onDiffFileLoad,
	],
	deduplicate: '.rgh-observing-whitespace',
	init,
});
