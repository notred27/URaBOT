importScripts("service_workers/service_worker_utils.js");
const twitterURL = "https://x.com"



//===========// Functions for Extension Message Listeners //===========//

/**
 * Obtain estimates for Bluesky from appropriate API route.
 * @param {*} request an onMesage Listener request
 */
async function routeTwitterToAPI(request) {
    const endpoint = await chrome.storage.local.get(['api_endpoint']);

    if (endpoint.api_endpoint === "localhost") {
        await chrome.scripting.executeScript({
            target: { tabId: request.tab.id },
            func: getTwitterEstimates,
        });
    } else if (endpoint.api_endpoint === "hf_spaces") {
        console.log("hf_spaces");
        await chrome.scripting.executeScript({
            target: { tabId: request.tab.id },
            func: getTwitterEstimatesGradio,
        });
    }
}


const delayedTwitterEstimate = debounce(async (request, sender) => {
    if (request.message === 'user_scrolled' && sender.origin === twitterURL) {
        if (extensionIsActive()) {
            const endpoint = await chrome.storage.local.get(['api_endpoint']);

            if (endpoint.api_endpoint === "localhost") {
                await chrome.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    func: getTwitterEstimates,
                });
            } else if (endpoint.api_endpoint === "hf_spaces") {
                console.log("hf_spaces");
                await chrome.scripting.executeScript({
                    target: { tabId: sender.tab.id },
                    func: getTwitterEstimatesGradio,
                });
            }
        }
    }
}, DEBOUNCE_DELAY_MS);


/**
 * Function that receives a message from content.js, and wakes up the service worker to
 * execute the relevant classification injection function.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    delayedTwitterEstimate(request, sender)
});



/**
 * Listen to see if the add estimates toggle (1st switch from index.html) is used.
 * Either ensures that all stored/previously found estimates are added and
 * then searches for new ones, or removes all injected estimates from the page's HTML.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'activate_estimate') {
        await chrome.storage.local.set({ 'activate_estimate': request.checked }) // Set new value of the switch

        if (request.checked && request.tab.url.startsWith(twitterURL)) {

            // Inject previously found estimate HTML
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: injectTwitterClassification,
            });

            await routeTwitterToAPI(request); // Search for new estimates

        } else if (request.tab.url.startsWith(twitterURL)) {
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

        if (request.checked && request.tab.url.startsWith(twitterURL)) {

            await routeTwitterToAPI(request);  // Get estimates

            // Inject disclaimers into the Bluesky tab
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: injectTwitterDisclaimers,
            });

        } else if (request.tab.url.startsWith(twitterURL)) {

            // Remove disclaimers from the Bluesky tab
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: removeTwitterDisclaimers,
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
async function getTwitterEstimates() {
    /**
     * 
     * @param {*} tweet 
     * @returns 
     */
    async function constructPayload(tweet) {
        try {

            // Get the user's twitter handel and display name
            const handle = tweet.querySelector('[data-testid="User-Name"]').textContent.split("@");
            const name = handle[0]                      // The display name
            const username = handle[1].split("·")[0]    // The @ name 

            // Get user's verification status
            let isVerified = false;
            if (tweet.querySelector('[aria-label="Verified account"]') != null) {
                isVerified = true
            }

            // Get the content of the user's tweet
            var tweetText = ""
            if (tweet.querySelector('[data-testid="tweetText"') != null) {
                tweetText = tweet.querySelector('[data-testid="tweetText"').textContent
            }

            // Format likes to integers
            var likes = ""
            if (tweet.querySelector('[data-testid="like"') != null) {
                likes = tweet.querySelector('[data-testid="like"').textContent

                if (likes.charAt(likes.length - 1) == 'K') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000

                } else if (likes.charAt(likes.length - 1) == 'M') {
                    likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000000
                }
            }

            return [username, name, tweetText, isVerified, likes]

        } catch (error) {   //TODO: Create a better handler for this
            console.error("Error classifying tweet batch", error)
        }
    }


    const allPromises = [];  // List of promises that will be processed
    let tweet_dict = await chrome.storage.local.get(['process_tweets']);    // All tweets that have been found so far
    let api_url = await chrome.storage.local.get(['endpoint']);


    // Search through all currently rendered tweets
    document.querySelectorAll('[data-testid="tweet"]').forEach(async tweet => {
        const psudoId = tweet.getAttribute("aria-labelledby").split(" ")[0];

        if (!(psudoId in tweet_dict.process_tweets)) { // Don't rerender processed tweets 

            tweet_dict.process_tweets[psudoId] = -1 // Set val to -1 to signal that this tweet has been found
            await chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets })


            const payloadValues = await constructPayload(tweet)

            // TODO: Make this batched to reduce # of connections to the API?
            // Construct API payload
            const tweetForm = new FormData();
            tweetForm.append('psudo_id', psudoId);
            tweetForm.append('username', payloadValues[0]);
            tweetForm.append('display_name', payloadValues[1]);
            tweetForm.append('tweet_content', payloadValues[2]);
            tweetForm.append('is_verified', payloadValues[3]);
            tweetForm.append('likes', payloadValues[4]);


            var tmpDiv = document.createElement("div");
            tmpDiv.innerHTML = `<img src=\"${chrome.runtime.getURL("icons/preloader.svg")}\"></img>`
            tmpDiv.className = "tmpDiv"
            tweet.appendChild(tmpDiv);


            // Create fetch requests to the API endpoint
            const fetchPromise = fetch(api_url.endpoint, {
                method: "POST",
                body: tweetForm,
            })
                .then((response) => {
                    if (response["status"] == 200) {  // Only continue if status is ok
                        return response.json();
                    }
                })
                .then((json) => {
                    // Add each tweet to the array with its prediction
                    tweet_dict.process_tweets[psudoId] = json.percent

                    chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets }).then(() => {
                        chrome.runtime.sendMessage({ message: 'update_tweets' });
                    });


                    try {
                        tweet.getElementsByClassName('tmpDiv')[0].remove()

                    } catch (error) {

                    }

                })
                .catch((err) => {
                    if (!err instanceof TypeError) {
                        // This is the response for querying a processed tweet / in process tweet
                        console.error("Exception occurred:", err)
                    }

                    try {
                        tweet.getElementsByClassName('tmpDiv')[0].remove()

                    } catch (error) {

                    }

                })

            allPromises.push(fetchPromise);

        }
    });

    // Wait for all promises to resolve, then send the data to local storage
    Promise.all(allPromises)
}




/**
 * Create HTML content to represent the bot estimation classification, and inject it into 
 * feed items on Twitter.
 */
async function injectTwitterClassification() {
    // Fetch stored tweet data in chrome's local storage
    chrome.storage.local.get(['process_tweets'], async (result) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving data:", chrome.runtime.lastError);

        } else {
            // Get the id of the most recent tweets
            const foundTweets = result.process_tweets;
            const tweetIds = Object.keys(foundTweets)

            // Check if this feature should be active from popup.js
            const activate_estimate = await chrome.storage.local.get(['activate_estimate']);

            tweetIds.forEach(id => {

                // Find the tweet by its psudoId
                const tweet = document.querySelector('[aria-labelledby*="' + id + '"]')

                // Case where tweet can no longer be found... || case where tweet isn't ready
                if (tweet == null || foundTweets[id] == -1) {
                    return;
                }


                // Check if it already has a clasification
                if (tweet.getElementsByClassName("rabot_check").length == 0 && activate_estimate.activate_estimate) {
                    const percent = foundTweets[id]; // Bot estimation score provided by our classifier

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
                    tweet.appendChild(classificationDiv);
                }
            });
        }
    });
}





/**
 * Inject HTML that adds a disclaimer and hide's a tweet's content on Twitter.
 * This script only applies to tweets with estimates over a certain threshold ('bot_threshold').
 */
async function injectTwitterDisclaimers() {
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


            tweetIds.forEach(id => {

                // Find the tweet by its psudoId
                const tweet = document.querySelector('[aria-labelledby*="' + id + '"]')

                // Case where tweet can no longer be found... || tweet hasn't been processed
                if (tweet == null || foundTweets[id] == -1) {
                    return;
                }

                // Check if it already has a classification
                if (tweet.getElementsByClassName("rabot_disclaimer").length == 0 && hide_bots.hide_bot_content) {

                    if (foundTweets[id] > threshold.bot_threshold) {
                        // Get all divs from the base tweet
                        const content = tweet.getElementsByTagName("div");

                        // Hide all of the tweet's content
                        for (let i = 0; i < content.length; i++) {
                            if (content[i] != null && content[i].className !== "rabot_check") {
                                content[i].style.display = "none";
                            }
                        }

                        // Create a button to revert hiding this tweet, and create show function
                        var btn = document.createElement("button");
                        btn.innerText = "Show anyways...";

                        // Add event listener to show the tweet "Show anyways..." button
                        btn.addEventListener("click", function (event) {
                            event.preventDefault(); // Prevent the default anchor action (e.g., page scroll)

                            // Restore the tweet's content
                            const tweet = document.querySelector('[aria-labelledby*="' + id + '"]');

                            if (tweet != null) {
                                // Get all divs from the base tweet
                                const content = tweet.getElementsByTagName("div");

                                // Show all the tweet's hidden content
                                for (let i = 0; i < content.length; i++) {
                                    if (content[i] != null && content[i].className !== "rabot_check") {
                                        content[i].style.display = ""; // Reset display to original state
                                    }
                                }

                                // Remove disclaimer
                                tweet.getElementsByClassName('rabot_disclaimer')[0].remove()

                                // Revert height
                                tweet.style.height = ""

                                // Hack: prevent relabeling
                                var disclaimerDiv = document.createElement("div");
                                disclaimerDiv.className = "rabot_disclaimer";
                                disclaimerDiv.style.display = "none";

                                // Inject the HTML
                                tweet.appendChild(disclaimerDiv);
                            }
                        });


                        // Add disclaimer
                        var disclaimerDiv = document.createElement("div");
                        disclaimerDiv.className = "rabot_disclaimer";
                        disclaimerDiv.innerHTML = `<span>This Tweet was likely created by a bot.&nbsp;</span>`;
                        disclaimerDiv.appendChild(btn);

                        tweet.style.height = "200px"; // TEMP: fix to prevent too many re-renders

                        // Inject the HTML
                        if (tweet.getElementsByClassName("rabot_check")[0] != null) {
                            tweet.insertBefore(disclaimerDiv, tweet.getElementsByClassName("rabot_check")[0]);

                        } else {
                            tweet.appendChild(disclaimerDiv);
                        }



                    } else {    //FIXME: hack to prevent tweet from getting reclassified
                        // Add disclaimer
                        var disclaimerDiv = document.createElement("div");
                        disclaimerDiv.className = "rabot_disclaimer";
                        disclaimerDiv.style.display = "none";

                        // Inject the HTML
                        tweet.appendChild(disclaimerDiv);
                    }
                }
            });
        }
    });
}




/**
 * Remove all "rabot_check" divs that were injected into Twitter's HTML.
 */
function removeTwitterDisclaimers() {
    document.querySelectorAll('[data-testid="tweet"]').forEach(async tweet => {

        // Remove the disclaimer divs
        const elms = tweet.getElementsByClassName('rabot_disclaimer')
        while (elms.length > 0) {
            elms[0].remove()
        }

        // Show the original content
        const content = tweet.getElementsByTagName("div");

        // Show all of the tweet's content
        for (let i = 0; i < content.length; i++) {
            if (content[i] != null) {
                content[i].style.display = "";
            }
        }

        // Set tweets hight to its previous value
        tweet.style.height = ""
    })
}





/**
 * Search for currently loaded tweets in the browser, and make a request to the API for classification.
 * Classification is then stored on the server and in Chrome's local storage.
 * 
 * Uses 'hf_spaces' API endpoint.
 */
async function getTwitterEstimatesGradio() {
    const allPromises = [];  // List of promises that will be processed
    const foundTweets = []; // Local tweets from this batch
    let tweet_dict = await chrome.storage.local.get(['process_tweets']);    // All tweets that have been found so far


    // Search through all currently rendered tweets
    document.querySelectorAll('[data-testid="tweet"]').forEach(async tweet => {
        const psudoId = tweet.getAttribute("aria-labelledby").split(" ")[0];

        if (!(psudoId in tweet_dict.process_tweets) && tweet.getElementsByClassName('tmpDiv').length == 0  && tweet.getElementsByClassName('rabot_check').length == 0) { // Don't rerender processed tweets 

            try { // Scrape tweet data
                const handle = tweet.querySelector('[data-testid="User-Name"]').textContent.split("@");
                const name = handle[0]
                const username = handle[1].split("·")[0]

                tweet_dict.process_tweets[psudoId] = -1 // Set val to -1 to signal that this tweet has been found
                await chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets })

                let isVerified = false;
                if (tweet.querySelector('[aria-label="Verified account"]') != null) {
                    isVerified = true
                }

                var tweetText = ""
                if (tweet.querySelector('[data-testid="tweetText"') != null) {
                    tweetText = tweet.querySelector('[data-testid="tweetText"').textContent
                }

                // Format likes to integers
                var likes = ""
                if (tweet.querySelector('[data-testid="like"') != null) {
                    likes = tweet.querySelector('[data-testid="like"').textContent

                    if (likes.charAt(likes.length - 1) == 'K') {
                        likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000

                    } else if (likes.charAt(likes.length - 1) == 'M') {
                        likes = parseFloat(likes.substring(0, likes.length - 1)) * 1000000
                    }
                }


                // TODO: Make this batched to reduce # of connections to the API?
                // Construct API payload
                const tweetForm = new FormData();
                tweetForm.append('psudo_id', psudoId);
                tweetForm.append('username', username);
                tweetForm.append('display_name', name);
                tweetForm.append('tweet_content', tweetText);
                tweetForm.append('is_verified', isVerified);
                tweetForm.append('likes', likes);

                var tmpDiv = document.createElement("div");
                tmpDiv.innerHTML = `<img src=\"${chrome.runtime.getURL("icons/preloader.svg")}\"></img>`
                tmpDiv.className = "tmpDiv"
                tweet.appendChild(tmpDiv);

                // Create fetch requests to the API endpoint
                const fetchPromise = fetch('https://mreidy3-urabot.hf.space/gradio_api/call/predict', {
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ "data": [name, tweetText, isVerified, likes] })
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

                                    chrome.storage.local.set({ process_tweets: tweet_dict.process_tweets }).then(() => {
                                        chrome.runtime.sendMessage({ message: 'update_tweets' });
                                    });

                                    foundTweets.push({ tweetId: psudoId, score: json.percent })

                                    try {
                                        tweet.getElementsByClassName('tmpDiv')[0].remove()

                                    } catch (error) {

                                    }

                                }
                            })
                    })
                    .catch((err) => {
                        if (!err instanceof TypeError) {
                            // This is the response for querying a proceessed tweet / in process tweet

                            console.error("Exception occurred:", err)
                        }

                        try {
                            tweet.getElementsByClassName('tmpDiv')[0].remove()

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


