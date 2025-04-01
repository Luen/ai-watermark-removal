# Watermark Removal Tool 🖼️

> An AI-powered web application that removes watermarks from images using Google's Gemini AI. Built with Node.js and Hono, featuring a modern drag-and-drop interface.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A web application that uses Google's Gemini AI to remove watermarks from images. Built with Node.js, Hono, and the Gemini API.

## Features

- Upload images and remove watermarks using AI
- Custom prompt support for specific watermark removal instructions
- Real-time image processing
- Side-by-side comparison of original and processed images
- Modern, responsive user interface
- RESTful API endpoint for programmatic access

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- Google Gemini API key

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/yourusername/watermark-removal.git
    cd watermark-removal
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Create a `.env` file in the root directory and add your Google Gemini API key:

    ```env
    GOOGLE_API_KEY=your_api_key_here
    ```

## Usage

1. Start the server:

    ```bash
    npm start
    ```

2. Open your web browser and navigate to:

    ```text
    http://localhost:3000
    ```

3. Upload an image and optionally provide a custom prompt for watermark removal.

## API Endpoints

### POST /remove-watermark

Removes watermarks from an uploaded image.

**Request:**

- Method: POST
- Content-Type: multipart/form-data
- Body:
  - `image`: Image file (required)
  - `prompt`: Custom prompt (optional)

**Response:**

```json
{
    "success": true,
    "text": "AI response text (if any)",
    "image": "base64_encoded_processed_image"
}
```

### GET /health

Health check endpoint.

**Response:**

```json
{
    "status": "ok"
}
```

## Project Structure

```text
watermark-removal/
├── public/
│   └── index.html      # Frontend interface
├── test/               # Directory for temporary processed images
├── .env               # Environment variables
├── package.json       # Project dependencies
├── README.md         # This file
└── server.js         # Backend server
```

## Dependencies

- @google/generative-ai: ^0.24.0
- @hono/node-server: ^1.8.2
- dotenv: ^16.4.1
- hono: ^4.0.5

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Google Gemini AI for providing the image processing capabilities
- Hono framework for the web server
- All contributors who help improve this project
