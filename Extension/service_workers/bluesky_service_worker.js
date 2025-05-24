importScripts("service_workers/service_worker_utils.js");
const bskyURL = "https://bsky.app"



//===========// Functions for Extension Message Listeners //===========//

/**
 * Obtain estimates for Bluesky from appropriate API route.
 * @param {*} request an onMesage Listener request
 */
async function routeBskyToAPI(request) {
    const endpoint = await chrome.storage.local.get(['api_endpoint']);

    if (endpoint.api_endpoint === "localhost") {
        await chrome.scripting.executeScript({
            target: { tabId: request.tab.id },
            func: getBskyEstimates,
        });
    } else if (endpoint.api_endpoint === "hf_spaces") {
        console.log("hf_spaces");
        await chrome.scripting.executeScript({
            target: { tabId: request.tab.id },
            func: getBskyEstimatesGradio,
        });
    }
}


// Stagger queries to API endpoint to prevent multiple attempted classifications for the same item.
const delayedBskyEstimate = debounce(async (request, sender) => {
    if (request.message === 'user_scrolled' && sender.origin === bskyURL) {
        if (extensionIsActive()) {
            const endpoint = await chrome.storage.local.get(['api_endpoint']);

            if (endpoint.api_endpoint === "localhost") {
                await chrome.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    func: getBskyEstimates,
                });
            } else if (endpoint.api_endpoint === "hf_spaces") {
                console.log("hf_spaces");
                await chrome.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    func: getBskyEstimatesGradio,
                });
            }
        }
    }
}, DEBOUNCE_DELAY_MS);



/**
 * Listen to see if the user has scrolled to wake up the service worker,
 * and then search for new feed items that haven't been classified yet.
 */
chrome.runtime.onMessage.addListener(async (request, sender) => {
    delayedBskyEstimate(request, sender);
});




/**
 * Listen to see if the add estimates toggle (1st switch from index.html) is used.
 * Either ensures that all stored/previously found estimates are added and
 * then searches for new ones, or removes all injected estimates from the page's HTML.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'activate_estimate') {
        await chrome.storage.local.set({ 'activate_estimate': request.checked }) // Set new value of the switch

        if (request.checked && request.tab.url.startsWith(bskyURL)) {

            // Inject previously found estimate HTML
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: injectBskyClassification,
            });

            await routeBskyToAPI(request); // Search for new estimates

        } else if (request.tab.url.startsWith(bskyURL)) {
            // Clean-up function for the injected estimates
            chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: cleanupClassification,
            });
        }

        // Check if the extension should be active
        await toggleActive();
    }
});



/**
 * Listen to see if the add disclaimer toggle (2nd switch from index.html) is used.
 * Either ensures that all estimates are found and injects disclaimers, or 
 * removes all injected disclaimers from the page's HTML.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'hide_bot_content') {

        await chrome.storage.local.set({ 'hide_bot_content': request.checked }) // Store new value of the switch

        if (request.checked && request.tab.url.startsWith(bskyURL)) {

            await routeBskyToAPI(request);  // Get estimates

            // Inject disclaimers into the Bluesky tab
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: injectBskyDisclaimers,
            });

        } else if (request.tab.url.startsWith(bskyURL)) {

            // Remove disclaimers from the Bluesky tab
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: removeBskyDisclaimers,
            });
        }

        // Check if the extension should be active
        await toggleActive();
    }
});





//===========// Functions for HTML parsing and injection //===========//



/**
 * Search for currently loaded tweets in the browser, and make a request to the API for classification.
 * Classification is then stored on the server and in Chrome's local storage.
 * 
 * Uses 'localhost' API endpoint.
 */
async function getBskyEstimates() {
    /**
     * 
     * @param {*} feedItem 
     * @returns 
     */
    async function constructPayload(feedItem) {
        try {

            // Get the user's twitter handel and display name
            const names = feedItem.querySelectorAll('[aria-label="View profile"]')
            const displayName = names[0].textContent
            const handel = names[1].textContent

            let text = ""
            try {
                text = feedItem.querySelectorAll('.css-146c3p1')[3].textContent
            } catch (error) {
            }


            let likes = ""
            if (feedItem.querySelector('[data-testid="likeCount"]') != null) {
                likes = feedItem.querySelector('[data-testid="likeCount"]').textContent

                if (likes.charAt(likes.length - 1) == 'K') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000

                } else if (likes.charAt(likes.length - 1) == 'M') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000000
                }
            }

            return [handel, displayName, text, likes]

        } catch (error) {   //TODO: Create a better handler for this
            console.error("Error classifying tweet batch", error)
        }
    }


    function makePsudoId(username, str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
        }
        // Convert to 32bit unsigned integer in base 36 and pad with "0" to ensure length is 7.
        return username + "_" + (hash >>> 0).toString(36).padStart(7, '0');
    }


    const allPromises = [];  // List of promises that will be processed
    let tweet_dict = await chrome.storage.local.get(['process_tweets']);    // All tweets that have been found so far
    let api_url = await chrome.storage.local.get(['endpoint']);


    // Search through all currently rendered feedItems
    document.querySelectorAll('[data-testid*="feedItem"]').forEach(async feedItem => {


        const payloadValues = await constructPayload(feedItem)

        // Hash over username and feedItem content to create a semi-unique psudoId
        const psudoId = makePsudoId(payloadValues[0], payloadValues[2]);


        // // TODO: Make this batched to reduce # of connections to the API?
        // // Construct API payload
        const tweetForm = new FormData();
        tweetForm.append('psudo_id', psudoId);     // FIXME: Create actual id for these items
        tweetForm.append('username', payloadValues[0]);
        tweetForm.append('display_name', payloadValues[1]);
        tweetForm.append('tweet_content', payloadValues[2]);
        tweetForm.append('is_verified', "");   // bsky doesn't have verification
        tweetForm.append('likes', payloadValues[3]);

        if (!(psudoId in tweet_dict.process_tweets)) { // Don't rerender processed tweets 
            tweet_dict.process_tweets[psudoId] = -1 // Set val to -1 to signal that this tweet has been found
            await chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets })



            var tmpDiv = document.createElement("div");
            tmpDiv.innerHTML = `<img src=\"${chrome.runtime.getURL("icons/preloader.svg")}\"></img>`
            tmpDiv.className = "tmpDiv"
            feedItem.children[0].children[2].appendChild(tmpDiv);

            // Create fetch requests to the API endpoint
            const fetchPromise = fetch(api_url.endpoint, {
                method: "POST",
                body: tweetForm,
                mode: "cors"
            })
                .then((response) => {
                    if (response["status"] == 200) {  // Only continue if status is ok
                        return response.json();
                    }

                    throw new Error(response.status + ' occurred during local API response.');
                })
                .then((json) => {
                    // Add each tweet to the array with its prediction
                    tweet_dict.process_tweets[psudoId] = json.percent

                    chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets }).then(() => {
                        chrome.runtime.sendMessage({ message: 'update_tweets' });
                    });

                    try {
                        feedItem.getElementsByClassName('tmpDiv')[0].remove()

                    } catch (error) {

                    }

                })
                .catch((err) => {
                    console.error(err)
                    feedItem.getElementsByClassName('tmpDiv')[0].innerText = "409." + tweet_dict.process_tweets[psudoId]

                    try {
                        feedItem.getElementsByClassName('tmpDiv')[0].remove()

                    } catch (error) {

                    }
                    // Ensure that classification is added here if item has already been classified?
                })

            allPromises.push(fetchPromise);

        }
    });

    // Wait for all promises to resolve, then send the data to local storage
    Promise.all(allPromises)
}



/**
 * Create HTML content to represent the bot estimation classification, and inject it into 
 * feed items on Bluesky.
 */
async function injectBskyClassification() {

    async function constructPayload(feedItem) {
        try {

            // Get the user's twitter handel and display name
            const names = feedItem.querySelectorAll('[aria-label="View profile"]')
            const displayName = names[0].textContent
            const handel = names[1].textContent

            let text = ""
            try {
                text = feedItem.querySelectorAll('.css-146c3p1')[3].textContent
            } catch (error) {
            }

            let likes = ""
            if (feedItem.querySelector('[data-testid="likeCount"]') != null) {
                likes = feedItem.querySelector('[data-testid="likeCount"]').textContent

                if (likes.charAt(likes.length - 1) == 'K') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000

                } else if (likes.charAt(likes.length - 1) == 'M') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000000
                }
            }
            return [handel, displayName, text, likes]

        } catch (error) {   //TODO: Create a better handler for this
            console.error("Error classifying tweet batch", error)
        }
    }

    function makePsudoId(username, str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
        }
        // Convert to 32bit unsigned integer in base 36 and pad with "0" to ensure length is 7.
        return username + "_" + (hash >>> 0).toString(36).padStart(7, '0');
    }


    // Fetch stored tweet data in chrome's local storage
    chrome.storage.local.get(['process_tweets'], async (result) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving data:", chrome.runtime.lastError);

        } else {
            // Get the id of the most recent tweets
            const foundFeedItems = result.process_tweets;
            const feedItemIds = Object.keys(foundFeedItems)

            // Check if this feature should be active from popup.js
            const activate_estimate = await chrome.storage.local.get(['activate_estimate']);


            document.querySelectorAll('[data-testid*="feedItem"]').forEach(async feedItem => {
                // Construct psudoId's from feedItem content
                const payloadValues = await constructPayload(feedItem)

                // Hash over username and feedItem content to create a semi-unique psudoId
                const psudoId = makePsudoId(payloadValues[0], payloadValues[2]);

                if (feedItemIds.includes(psudoId)) {
                    if (foundFeedItems[psudoId] == -1) {
                        return;
                    }

                    // console.log(psudoId, feedItem.getElementsByClassName("rabot_check").length, foundFeedItems[psudoId])

                    if (feedItem.getElementsByClassName("rabot_check").length == 0 && activate_estimate.activate_estimate) {
                        const percent = foundFeedItems[psudoId]; // Bot estimation score provided by our classifier

                        // Create HTML elements to be injected 
                        var classificationDiv = document.createElement("div");
                        classificationDiv.className = "rabot_check";
                        classificationDiv.innerHTML = `<b>${(percent * 100).toFixed(1)}%</b>`;

                        // Set the color of the classification's border depending on value
                        if (percent < 0.5) {
                            classificationDiv.style.border = `solid 5px rgb(${200 * percent * 2}, 250, ${2 * percent * 200})`;
                        } else {
                            classificationDiv.style.border = `solid 5px rgb(250, ${220 - (percent - 0.5) * 2 * 220}, ${220 - (percent - 0.5) * 2 * 220})`;
                        }

                        // Inject the HTML onto the page
                        feedItem.children[0].children[2].appendChild(classificationDiv);
                        // feedItem.appendChild(classificationDiv);
                    }
                }
            })
        }
    });
}




/**
 * Inject HTML that adds a disclaimer and hide's a feed item's content on BlueSky.
 * This script only applies to feed items with estimates over a certain threshold ('bot_threshold').
 */
async function injectBskyDisclaimers() {
    async function constructPayload(feedItem) {
        try {

            // Get the user's twitter handel and display name
            const names = feedItem.querySelectorAll('[aria-label="View profile"]')
            const displayName = names[0].textContent
            const handel = names[1].textContent

            let text = ""
            try {
                text = feedItem.querySelectorAll('.css-146c3p1')[3].textContent
            } catch (error) {
            }

            let likes = ""
            if (feedItem.querySelector('[data-testid="likeCount"]') != null) {
                likes = feedItem.querySelector('[data-testid="likeCount"]').textContent

                if (likes.charAt(likes.length - 1) == 'K') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000

                } else if (likes.charAt(likes.length - 1) == 'M') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000000
                }
            }
            return [handel, displayName, text, likes]

        } catch (error) {   //TODO: Create a better handler for this
            console.error("Error classifying tweet batch", error)
        }
    }

    function makePsudoId(username, str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
        }
        // Convert to 32bit unsigned integer in base 36 and pad with "0" to ensure length is 7.
        return username + "_" + (hash >>> 0).toString(36).padStart(7, '0');
    }



    // Fetch stored tweet data in chrome's local storage
    chrome.storage.local.get(['process_tweets'], async (result) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving data:", chrome.runtime.lastError);

        } else {
            // Get the id and score of most recent tweets
            const foundTweets = result.process_tweets;
            const tweetIds = Object.keys(foundTweets)

            // Get current threshold (as set by user)
            const threshold = await chrome.storage.local.get(['bot_threshold']);

            // Check to see if this feature should be active (as set in popup.js)
            const hide_bots = await chrome.storage.local.get(['hide_bot_content']);


            document.querySelectorAll('[data-testid*="feedItem"]').forEach(async feedItem => {
                // Construct psudoId's from feedItem content
                const payloadValues = await constructPayload(feedItem)

                // Hash over username and feedItem content to create a semi-unique psudoId
                const psudoId = makePsudoId(payloadValues[0], payloadValues[2]);

                if (tweetIds.includes(psudoId)) {
                    if (foundTweets[psudoId] == -1) {
                        return;
                    }


                    // Check if it already has a classification
                    if (feedItem.getElementsByClassName("rabot_disclaimer").length == 0 && hide_bots.hide_bot_content) {

                        if (foundTweets[psudoId] > threshold.bot_threshold) {
                            // Get all divs from the base tweet
                            const content = feedItem.children[0].children[2].getElementsByTagName("div");

                            // Hide all of the tweet's content
                            for (let i = 0; i < content.length; i++) {
                                if (content[i] != null && content[i].className !== "rabot_check") {  // FIXME: This still hides tweet classifications
                                    content[i].style.display = "none";
                                }
                            }

                            // Create a button to revert hiding this tweet, and create show function
                            var btn = document.createElement("button");
                            btn.innerText = "Show anyways...";

                            // Add event listener to show the tweet "Show anyways..." button
                            btn.addEventListener("click", function (event) {
                                event.preventDefault(); // Prevent the default anchor action (e.g., page scroll)

                                // Show all the tweet's hidden content
                                for (let i = 0; i < content.length; i++) {
                                    if (content[i] != null && content[i].className !== "rabot_check") {
                                        content[i].style.display = ""; // Reset display to original state
                                    }
                                }

                                // Remove disclaimer
                                feedItem.children[0].children[2].getElementsByClassName('rabot_disclaimer')[0].remove()


                                // Hack: prevent relabeling
                                var disclaimerDiv = document.createElement("div");
                                disclaimerDiv.className = "rabot_disclaimer";
                                disclaimerDiv.style.display = "none";

                                // Inject the HTML
                                feedItem.appendChild(disclaimerDiv);

                            });


                            // Add disclaimer
                            var disclaimerDiv = document.createElement("div");
                            disclaimerDiv.className = "rabot_disclaimer";
                            disclaimerDiv.innerHTML = `<span>This post was likely created by a bot.&nbsp;</span>`;
                            disclaimerDiv.appendChild(btn);

                            // feedItem.style.height = "200px"; // TEMP: fix to prevent too many re-renders

                            // Inject the HTML
                            feedItem.children[0].children[2].appendChild(disclaimerDiv);

                            if (feedItem.children[0].children[2].getElementsByClassName("rabot_check")[0] != null) {
                                feedItem.children[0].children[2].insertBefore(disclaimerDiv, feedItem.children[0].children[2].getElementsByClassName("rabot_check")[0]);

                            } else {
                                feedItem.children[0].children[2].appendChild(disclaimerDiv);
                            }


                        } else {    //FIXME: hack to prevent tweet from getting reclassified
                            // Add disclaimer
                            var disclaimerDiv = document.createElement("div");
                            disclaimerDiv.className = "rabot_disclaimer";
                            disclaimerDiv.style.display = "none";

                            // Inject the HTML
                            feedItem.appendChild(disclaimerDiv);
                        }
                    }
                }
            })
        }
    });
}





/**
 * Remove all "rabot_check" divs that were injected into BlueSky's HTML.
 */
function removeBskyDisclaimers() {
    document.querySelectorAll('[data-testid*="feedItem"]').forEach(async feedItem => {

        // Remove the disclaimer divs
        const elms = feedItem.getElementsByClassName('rabot_disclaimer')
        while (elms.length > 0) {
            elms[0].remove()
        }

        // Show the original content
        const content = feedItem.getElementsByTagName("div");

        // Show all of the tweet's content
        for (let i = 0; i < content.length; i++) {
            if (content[i] != null) {
                content[i].style.display = "";
            }
        }
    })
}




/**
 * Search for currently loaded feed items in the browser, and make a request to the API for classification.
 * Classification is then stored on the server and in Chrome's local storage.
 * 
 * Uses 'hf_spaces' API endpoint.
 */
async function getBskyEstimatesGradio() {

    async function constructPayload(feedItem) {
        try {

            // Get the user's twitter handel and display name
            const names = feedItem.querySelectorAll('[aria-label="View profile"]')
            const displayName = names[0].textContent
            const handel = names[1].textContent

            let text = ""
            try {
                text = feedItem.querySelectorAll('.css-146c3p1')[3].textContent
            } catch (error) {
            }


            let likes = ""
            if (feedItem.querySelector('[data-testid="likeCount"]') != null) {
                likes = feedItem.querySelector('[data-testid="likeCount"]').textContent

                if (likes.charAt(likes.length - 1) == 'K') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000

                } else if (likes.charAt(likes.length - 1) == 'M') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000000
                }
            }

            return [handel, displayName, text, likes]

        } catch (error) {   //TODO: Create a better handler for this
            console.error("Error classifying tweet batch", error)
        }
    }


    function makePsudoId(username, str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
        }
        // Convert to 32bit unsigned integer in base 36 and pad with "0" to ensure length is 7.
        return username + "_" + (hash >>> 0).toString(36).padStart(7, '0');
    }


    const allPromises = [];  // List of promises that will be processed
    const foundTweets = []; // Local tweets from this batch
    let tweet_dict = await chrome.storage.local.get(['process_tweets']);    // All tweets that have been found so far


    // Search through all currently rendered tweets
    document.querySelectorAll('[data-testid*="feedItem"]').forEach(async feedItem => {
        const payloadValues = await constructPayload(feedItem)

        // Hash over username and feedItem content to create a semi-unique psudoId
        const psudoId = makePsudoId(payloadValues[0], payloadValues[2]);


        if (!(psudoId in tweet_dict.process_tweets) && feedItem.getElementsByClassName('tmpDiv').length == 0) { // Don't rerender processed tweets 

            try { // Scrape tweet data
                tweet_dict.process_tweets[psudoId] = -1 // Set val to -1 to signal that this tweet has been found
                await chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets })


                var tmpDiv = document.createElement("div");
                tmpDiv.innerHTML = `<img src=\"${chrome.runtime.getURL("icons/preloader.svg")}\"></img>`
                tmpDiv.className = "tmpDiv"
                feedItem.children[0].children[2].appendChild(tmpDiv);



                // Create fetch requests to the API endpoint
                const fetchPromise = fetch('https://mreidy3-urabot.hf.space/gradio_api/call/predict', {
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ "data": [payloadValues[1], payloadValues[2], "", payloadValues[3]] })
                })
                    .then((response) => {
                        if (response["status"] == 200) {  // Only continue if status is ok
                            return response.json();
                        }
                    })
                    .then((json) => {
                        fetch(`https://mreidy3-urabot.hf.space/gradio_api/call/predict/${json.event_id}`, {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                            }
                        })
                            .then(data1 => {
                                if (data1.status == 200) {
                                    return data1.text()
                                }
                            })
                            .then(text => {

                                const regex = /data:\s*(\[[^\]]+\])/;  // Matches the 'data' part
                                const match = text.match(regex);

                                // Step 2: If match is found, parse the string as JSON to get the array
                                if (match) {
                                    const dataArray = JSON.parse(match[1]);  // Parse the array from the string

                                    // Step 3: Extract the numeric value from the array
                                    const numericValue = parseFloat(dataArray[0]);  // Convert the string to a number
                                    console.log(psudoId, numericValue)

                                    // Add each tweet to the array with its prediction
                                    tweet_dict.process_tweets[psudoId] = numericValue

                                    foundTweets.push({ tweetId: psudoId, score: json.percent })

                                    try {
                                        feedItem.children[0].children[2].getElementsByClassName('tmpDiv')[0].remove()

                                    } catch (error) {

                                    }

                                    chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets }).then(() => {
                                        chrome.runtime.sendMessage({ message: 'update_tweets' });
                                    });

                                }
                            })
                    })
                    .catch((err) => {
                        if (!err instanceof TypeError) {
                            // This is the response for querying a proceessed tweet / in process tweet

                            console.error("Exception occurred:", err)
                        }

                        try {
                            feedItem.children[0].children[2].getElementsByClassName('tmpDiv')[0].remove()

                        } catch (error) {

                        }

                    })

                allPromises.push(fetchPromise);

            } catch (error) {   //TODO: Create a better handler for this
                console.error("Error classifying tweet batch", error)
            }

        }
    });

    // Wait for all promises to resolve, then send the data to local storage
    Promise.all(allPromises)
}
