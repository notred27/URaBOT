importScripts("service_workers/service_worker_utils.js");

importScripts("service_workers/bluesky_service_worker.js");
importScripts("service_workers/twitter_service_worker.js");


const API_ENDPOINT = 'http://127.0.0.1:5000/verify';


// Set the badge text to OFF when the extension is initially loaded
// Additionally set local variables when initially loaded
chrome.runtime.onInstalled.addListener(async () => {
    chrome.action.setBadgeText({
        text: "OFF",
    });

    chrome.storage.local.set({ 'activate_estimate': false })
    chrome.storage.local.set({ 'hide_bot_content': false })
    chrome.storage.local.set({ 'bot_threshold': 0.75 })
    chrome.storage.local.set({ process_tweets: { "test": 0 } });
    chrome.storage.local.set({ 'endpoint': API_ENDPOINT })
    chrome.storage.local.set({ 'api_endpoint': "localhost" })
});






/**
 * Function that receives a message from the getEstimates function (which sends updated data)
 * and processes HTML to be injected for newly received tweets.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'update_tweets') {

        chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
            // Get the active tab
            const activeTab = tabs[0];

            // Check for valid context 
            if (activeTab.url.startsWith(twitterURL)) {
                // Execute the HTML injection function for hiding bot content
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: injectTwitterDisclaimers,
                });

                // Execute the HTML injection function for adding tweet classifications
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: injectTwitterClassification,
                });

            } else if (activeTab.url.startsWith(bskyURL)) {
                // Execute the HTML injection function for hiding bot content
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: injectBskyDisclaimers,
                });

                // Execute the HTML injection function for adding tweet classifications
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: injectBskyClassification,
                });
            }
        })
    }
});



// Listen to see if the show estimate switch (from index.html) is used 
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'activate_estimate') {
        chrome.storage.local.set({ 'activate_estimate': request.checked }).then(() => {

            if (request.checked) {

                if (request.tab.url.startsWith(twitterURL)) {
                    chrome.scripting.executeScript({
                        target: { tabId: request.tab.id },
                        func: injectTwitterClassification,
                    });

                    // Automatically injected estimates without need for scrolling
                    chrome.scripting.executeScript({
                        target: { tabId: request.tab.id },
                        func: getTwitterEstimates,
                    });
                } else if (request.tab.url.startsWith(bskyURL)) {
                    chrome.scripting.executeScript({
                        target: { tabId: request.tab.id },
                        func: injectBskyClassification,
                    });

                    chrome.scripting.executeScript({
                        target: { tabId: request.tab.id },
                        func: getBskyEstimates,
                    });

                }

            } else {
                // Clean-up function for the injected estimates
                chrome.scripting.executeScript({
                    target: { tabId: request.tab.id },
                    func: cleanupClassification,
                });
            }
        });

        // Check if the extension should be active
        await toggleActive();
    }
});


// Listen to see if the hide bot content slider (from index.html) is used 
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'hide_bot_content') {
        chrome.storage.local.set({ 'hide_bot_content': request.checked }).then(async () => {
            if (request.checked) {
                if (request.tab.url.startsWith(twitterURL)) {
                    // Automatically injected estimates without need for scrolling
                    await chrome.scripting.executeScript({  // Fetch unknown values
                        target: { tabId: request.tab.id },
                        func: getTwitterEstimates,
                    });

                    await chrome.scripting.executeScript({  // add disclaimers 
                        target: { tabId: request.tab.id },
                        func: injectTwitterDisclaimers,
                    });


                } else if (request.tab.url.startsWith(bskyURL)) {
                    // Automatically injected estimates without need for scrolling
                    await chrome.scripting.executeScript({  // Fetch unknown values
                        target: { tabId: request.tab.id },
                        func: getBskyEstimates,
                    });

                    await chrome.scripting.executeScript({  // add disclaimers 
                        target: { tabId: request.tab.id },
                        func: injectBskyDisclaimers,
                    });
                }


            } else {

                if (request.tab.url.startsWith(twitterURL)) {

                    await chrome.scripting.executeScript({
                        target: { tabId: request.tab.id },
                        func: removeTwitterDisclaimers,
                    });

                } else if (request.tab.url.startsWith(bskyURL)) {
                    await chrome.scripting.executeScript({
                        target: { tabId: request.tab.id },
                        func: removeBskyDisclaimers,
                    });
                }

            }
        });

        // Check if the extension should be active
        await toggleActive();
    }
});






//===========// Functions for HTML injection //===========//




// (Twitter) Search for currently loaded tweets in the browser, and make a request to the API for classification
async function getEstimatesGradio() {
    const allPromises = [];  // List of promises that will be processed
    const foundTweets = []; // Local tweets from this batch
    let tweet_dict = await chrome.storage.local.get(['process_tweets']);    // All tweets that have been found so far


    // Search through all currently rendered tweets
    document.querySelectorAll('[data-testid="tweet"]').forEach(async tweet => {
        const psudoId = tweet.getAttribute("aria-labelledby").split(" ")[0];

        if (!(psudoId in tweet_dict.process_tweets)) { // Don't rerender processed tweets 

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


                                }
                            })
                    })
                    .catch((err) => {
                        if (!err instanceof TypeError) {
                            // This is the response for querying a proceessed tweet / in process tweet

                            console.error("Exception occurred:", err)
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
