

var DEBOUNCE_DELAY_MS = 500;



/**
 * Function that determines if the extension is currently active or not.
 * @returns Boolean (if the extension should be currently active)
 */
async function extensionIsActive() {
    const hide_bots = await chrome.storage.local.get(['hide_bot_content']);
    const activate_estimate = await chrome.storage.local.get(['activate_estimate']);

    return hide_bots.hide_bot_content || activate_estimate.activate_estimate;
}


// Debounce function to prevent API overload / repeat requests
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}



// Function that removes all of the "rabot_check" divs that were injected into the page
function cleanupClassification() {
    const elms = document.getElementsByClassName('rabot_check')

    while (elms.length > 0) {
        elms[0].remove()
    }
}



// Function that changes the badge text depending on if the extension is active
async function toggleActive() {
    const isActive = await extensionIsActive();
    const nextState = isActive ? 'ON' : 'OFF';

    await chrome.action.setBadgeText({
        text: nextState,
    });
}