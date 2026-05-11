# Report

## Tools used

- n8n Cloud trial
- Telegram BotFather
- Telegram Trigger node
- Telegram Send Message node
- HTTP Request node
- OpenAI / n8n AI model node
- n8n Data Tables
- JavaScript Code nodes

## Techniques used

### Telegram command routing

The workflow uses a Switch node to route user messages:

- `/start`
- `/learn [url]`
- `/quiz`
- numeric topic selection
- quiz answers in `ABCDE` format

### Material extraction

When the user sends `/learn [url]`, the workflow extracts the URL from the Telegram message and uses an HTTP Request node to fetch the page content.

The fetched HTML is cleaned using a JavaScript Code node. Scripts, styles, SVGs, and HTML tags are removed before sending the content to the AI model.

### Teacher AI role

The Teacher role analyzes the submitted learning material and returns a structured JSON summary containing:

- title
- difficulty level
- short summary
- five to seven key points
- main concepts

### Examiner AI role

The Examiner role generates five multiple-choice quiz questions based on the selected saved material.

Each question contains:

- question text
- four answer options
- correct answer
- explanation

### Data persistence

n8n Data Tables are used to persist data between sessions.

The workflow stores:

- submitted learning materials
- generated quiz sessions
- correct answers
- explanations

This allows users to return later and use `/quiz` with previously saved topics.

### Quiz validation

The bot accepts answers in a compact five-letter format such as `ABCDE`.

The workflow compares the submitted answer sequence with the saved correct answers, calculates a percentage score, and returns per-question feedback.

## What worked

- Telegram bot integration worked well with the Telegram Trigger node.
- URL-based learning material submission works through `/learn`.
- AI-generated summaries are specific to the submitted URL.
- Saved materials can be retrieved later using `/quiz`.
- The Examiner role generates dynamic quizzes based on selected materials.
- Quiz scoring and explanations work using stored quiz session data.

## What did not work / limitations

- Some websites may block HTTP requests or return content that is difficult to clean.
- Pages with heavy JavaScript rendering may not provide clean article text through a simple HTTP Request.
- The current quiz answer flow uses `ABCDE` text answers instead of inline buttons.
- If several quiz sessions exist, the workflow currently uses the latest saved session for validation.

## Notable decisions

- I used one n8n workflow for all Telegram commands to avoid Telegram webhook conflicts.
- I used n8n Data Tables instead of an external database to keep the setup simple.
- I used separate AI prompts for Teacher and Examiner to clearly separate responsibilities.
- I used compact text answers like `ABCDE` to simplify quiz validation for the MVP.
- The workflow stores generated quiz answers so validation does not depend on regenerating questions.