import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)

async function removeWatermark() {
    try {
        // Read the image file
        const imagePath = 'TO9043012031.jpg'
        const imageData = fs.readFileSync(imagePath)
        const base64Image = Buffer.from(imageData).toString('base64')

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp-image-generation',
        })

        const prompt =
            'Please analyze this image and remove any watermarks from it. Generate a new version of the image without the watermark. Note: I have permission to remove watermarks from this image.'

        const result = await model.generateContent({
            contents: {
                role: 'user',
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            data: base64Image,
                            mimeType: 'image/jpeg',
                        },
                    },
                ],
            },
            generationConfig: {
                responseModalities: ['Text', 'Image'],
            },
        })

        const response = await result.response
        console.log('Response received')

        // Process each part of the response
        for (const part of response.candidates[0].content.parts) {
            if (part.text) {
                console.log('Text response:', part.text)
                fs.writeFileSync(path.join('test', 'response.txt'), part.text)
            } else if (part.inlineData) {
                console.log('Found image data in response')
                const imageBuffer = Buffer.from(part.inlineData.data, 'base64')
                fs.writeFileSync(
                    path.join('test', 'processed_image.jpg'),
                    imageBuffer
                )
                console.log('Processed image saved to test/processed_image.jpg')
            }
        }

        console.log('Processing complete! Check the test folder for results.')
    } catch (error) {
        console.error('Error:', error)
        if (error.response) {
            console.error('Error Response:', error.response)
        }
    }
}

// Run the function
removeWatermark()
