# Watermark Removal Tool

A web application that uses AI to detect and remove watermarks from images. Built with Node.js and powered by Google's Gemini AI.

## Features

- Drag-and-drop image upload
- Support for PNG, JPG, and JPEG formats
- AI-powered watermark detection and removal
- Real-time processing feedback
- Clean and intuitive user interface
- Comprehensive API documentation

## API Documentation

The API documentation is available at `/api` and includes detailed information about all available endpoints:

- `POST /remove-watermark` - Remove watermark from an image
- `POST /detect-watermark` - Detect if an image contains a watermark
- `GET /health` - Check API health status

For detailed API documentation, visit `http://localhost:3000/api` when running the application.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google API Key for Gemini AI

## Setup

1. Clone the repository:

    ```bash
    git clone https://github.com/yourusername/watermark-removal.git
    cd watermark-removal
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Create a `.env` file in the root directory and add your Google API key:

    ```env
    GOOGLE_API_KEY=your_api_key_here
    ```

4. Start the server:

    ```bash
    npm start
    ```

The application will be available at `http://localhost:3000`

## Project Structure

```
watermark-removal/
├── public/
│   ├── index.html      # Main application interface
│   └── api.html        # API documentation
├── uploads/            # Temporary storage for uploaded images
├── processed/          # Storage for processed images
├── logs/              # Application logs
├── server.js          # Main server file
├── package.json       # Project dependencies
└── .env              # Environment variables
```

## API Endpoints

### Remove Watermark
- **URL**: `/remove-watermark`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Parameters**:
  - `image`: Image file (PNG, JPG, JPEG)
- **Response**: JSON object with processing results and processed image

### Detect Watermark
- **URL**: `/detect-watermark`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Parameters**:
  - `image`: Image file (PNG, JPG, JPEG)
- **Response**: JSON object with detection results

### Health Check
- **URL**: `/health`
- **Method**: `GET`
- **Response**: JSON object with API status

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
- All contributors who help improve this project
