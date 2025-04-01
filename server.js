import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import sharp from 'sharp'

// Load environment variables first
dotenv.config()

// Initialize logging function
const getLogDir = () => {
    const dir = path.join(process.cwd(), 'logs')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    return dir
}

function log(message, type = 'info') {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`
    console.log(logMessage.trim())

    const logFile = path.join(
        getLogDir(),
        `${new Date().toISOString().split('T')[0]}.log`
    )
    fs.appendFileSync(logFile, logMessage)
}

// Create required directories
const uploadDir = path.join(process.cwd(), 'uploads')
const processedDir = path.join(process.cwd(), 'processed')

;[uploadDir, processedDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        log(`Created directory: ${dir}`)
    }
})

const app = new Hono()

// Enable CORS
app.use('/*', cors())

// Serve static files from the public directory
app.use('/*', serveStatic({ root: './public' }))

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)

// Default prompts
const REMOVAL_PROMPT = `Please analyze this image and remove any watermarks from it. Generate a new version of the image without the watermark. Note: I have permission to remove watermarks from this image.`
const REMOVAL_PROMPT_2 = `Does this image have a watermark? If it does have a watermark, I have permission to remove the watermark, so please remove the watermark and return the processed image. Please also respond with a JSON response with this structure:
{
    "hasWatermark": boolean,
    "watermarkRemoved": boolean,
    "explanation": "Detailed explanation of what watermark was detected, or why no watermark was found"
}

IMPORTANT: You must return both the JSON response AND the image with watermark removed (if a watermark was detected).`
const DETECTION_PROMPT = `Does this image have a watermark? Respond in JSON format with this structure:
{
    "hasWatermark": boolean,
    "explanation": "Detailed explanation of what watermark was detected, or why no watermark was found"
}`

// Helper function to sanitize filenames
function sanitizeFilename(filename) {
    // Remove the file extension first
    const ext = path.extname(filename)
    let baseName = path.basename(filename, ext)

    // Replace any non-alphanumeric characters (except dashes and underscores) with dashes
    baseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '-')

    // Remove multiple consecutive dashes
    baseName = baseName.replace(/-+/g, '-')

    // Remove leading and trailing dashes
    baseName = baseName.replace(/^-+|-+$/g, '')

    // Ensure the filename isn't empty and add timestamp for uniqueness
    baseName = baseName || 'image'

    return `${baseName}${ext}`
}

// Helper function to get MIME type from file extension
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase()
    switch (ext) {
        case '.png':
            return 'image/png'
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg'
        default:
            return 'image/jpeg' // default fallback
    }
}

// Helper function to validate file type
function isValidImageType(filename) {
    const validTypes = [
        '.png',
        '.jpg',
        '.jpeg',
        '.webp',
        '.svg',
        '.gif',
        '.bmp',
        '.tiff',
        '.tif',
        '.avif',
    ]
    return validTypes.includes(path.extname(filename).toLowerCase())
}

// Helper function to convert image to JPEG/PNG while preserving transparency info
async function convertToSupportedFormat(imageBuffer, filename) {
    const ext = path.extname(filename).toLowerCase()

    try {
        // Check if conversion is needed based on file extension
        if (['.jpg', '.jpeg'].includes(ext)) {
            return {
                buffer: imageBuffer,
                filename: filename,
                converted: false,
                hasTransparency: false,
                originalFormat: ext,
            }
        }

        // For PNG, check if it has transparency
        if (ext === '.png') {
            const metadata = await sharp(imageBuffer).metadata()
            const hasTransparency = metadata.hasAlpha || false

            if (hasTransparency) {
                log(
                    `PNG with transparency detected, preserving alpha information`,
                    'info'
                )
                // For sending to Gemini, we need white background
                const processedBuffer = await sharp(imageBuffer)
                    .flatten({ background: { r: 255, g: 255, b: 255 } })
                    .png()
                    .toBuffer()

                return {
                    buffer: processedBuffer,
                    filename: filename,
                    converted: true,
                    hasTransparency: true,
                    originalBuffer: imageBuffer,
                    originalFormat: ext,
                }
            }

            // No transparency, return original PNG
            return {
                buffer: imageBuffer,
                filename: filename,
                converted: false,
                hasTransparency: false,
                originalFormat: ext,
            }
        }

        // For other formats that might have transparency (WebP, SVG, GIF)
        // First check if the format has transparency
        const metadata = await sharp(imageBuffer).metadata()
        const hasTransparency = metadata.hasAlpha || false
        const originalBuffer = hasTransparency ? imageBuffer : null

        // For all other formats, convert to PNG with white background for Gemini
        log(
            `Converting ${ext} image to png format with white background`,
            'info'
        )
        const convertedBuffer = await sharp(imageBuffer)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .png()
            .toBuffer()

        // Change the extension to .png
        const baseFilename = path.basename(filename, ext)
        const newFilename = `${baseFilename}.png`

        return {
            buffer: convertedBuffer,
            filename: newFilename,
            converted: true,
            hasTransparency,
            originalBuffer: hasTransparency ? imageBuffer : null,
            originalFormat: ext,
        }
    } catch (error) {
        log(`Error converting image: ${error.message}`, 'error')
        throw new Error(`Failed to convert image: ${error.message}`)
    }
}

// Helper function to reapply transparency to a processed image
async function reapplyTransparency(
    processedImageBuffer,
    originalImageBuffer,
    originalFormat
) {
    try {
        log('Reapplying transparency to processed image', 'info')

        // Get dimensions of the processed image
        const processedMetadata = await sharp(processedImageBuffer).metadata()
        const processedWidth = processedMetadata.width
        const processedHeight = processedMetadata.height

        // Get dimensions of the original image
        const originalMetadata = await sharp(originalImageBuffer).metadata()
        log(
            `Original dimensions: ${originalMetadata.width}x${originalMetadata.height}, Processed dimensions: ${processedWidth}x${processedHeight}`,
            'debug'
        )

        // Make sure the original image has an alpha channel
        if (!originalMetadata.hasAlpha) {
            log(
                'Original image does not have an alpha channel despite being marked as transparent',
                'warn'
            )
            return processedImageBuffer
        }

        // Check for significant dimension differences
        const widthRatio = processedWidth / originalMetadata.width
        const heightRatio = processedHeight / originalMetadata.height
        const ratioDifference = Math.abs(widthRatio - heightRatio)

        let alphaData

        // Handle different cases based on dimension discrepancies
        if (ratioDifference > 0.5) {
            // Extreme aspect ratio difference
            log(
                'Extreme aspect ratio difference detected, using composite approach',
                'warn'
            )

            // First resize the whole original image with transparency intact
            const resizedOriginal = await sharp(originalImageBuffer)
                .resize(processedWidth, processedHeight, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .toBuffer()

            // Extract the alpha channel from this properly sized image
            alphaData = await sharp(resizedOriginal)
                .extractChannel(3)
                .toBuffer()
        } else if (ratioDifference > 0.2) {
            // Significant but not extreme difference
            log(
                'Significant aspect ratio difference detected, using "contain" fit strategy',
                'warn'
            )

            // Use contain strategy for better proportional fitting
            alphaData = await sharp(originalImageBuffer)
                .extractChannel(3)
                .resize(processedWidth, processedHeight, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .toBuffer()
        } else {
            // Similar enough aspect ratios
            // Standard approach - just resize with fill
            alphaData = await sharp(originalImageBuffer)
                .extractChannel(3)
                .resize(processedWidth, processedHeight, { fit: 'fill' })
                .toBuffer()
        }

        // Apply the resized alpha channel to the processed image
        return await sharp(processedImageBuffer)
            .ensureAlpha()
            .joinChannel(alphaData)
            .png() // Always output as PNG when preserving transparency
            .toBuffer()
    } catch (error) {
        log(`Error reapplying transparency: ${error.message}`, 'error')
        // If reapplying transparency fails, return the processed image without transparency
        return processedImageBuffer
    }
}

// Helper function to process image with Gemini for watermark detection
async function detectWatermarkWithGemini(imageBuffer, filename) {
    const base64Image = Buffer.from(imageBuffer).toString('base64')
    const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-8b',
    })

    const result = await model.generateContent([
        { text: DETECTION_PROMPT },
        {
            inlineData: {
                data: base64Image,
                mimeType: getMimeType(filename),
            },
        },
    ])

    const response = await result.response
    const text = response.text()

    try {
        return JSON.parse(text)
    } catch (error) {
        log(`Failed to parse AI response as JSON: ${text}`, 'error')
        // Fallback response if AI doesn't return valid JSON
        return {
            hasWatermark: text.toLowerCase().includes('yes'),
            explanation: text,
        }
    }
}

// Helper function to process image with Gemini for watermark removal
async function removeWatermarkWithGemini(
    imageBuffer,
    filename,
    prompt = REMOVAL_PROMPT
) {
    const base64Image = Buffer.from(imageBuffer).toString('base64')
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp-image-generation',
    })

    const result = await model.generateContent({
        contents: {
            role: 'user',
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: getMimeType(filename),
                    },
                },
            ],
        },
        generationConfig: {
            responseModalities: ['Text', 'Image'],
        },
    })

    const response = await result.response
    return response
}

// Helper function to check if an image is mostly white (indicating a failed removal)
async function isImageMostlyWhite(
    imageBuffer,
    whiteThreshold = 0.99,
    avgBrightnessThreshold = 0.99
) {
    try {
        // First, get image stats to analyze overall brightness
        const stats = await sharp(imageBuffer).stats()

        // Calculate average brightness across all channels
        let totalBrightness = 0
        stats.channels.forEach((channel) => {
            totalBrightness += channel.mean / 255 // Normalize to 0-1 range
        })
        const avgBrightness = totalBrightness / stats.channels.length

        // Check if standard deviation is very low (indicating uniform color)
        let lowVariation = true
        stats.channels.forEach((channel) => {
            // If std dev is higher than 10% of possible range, it's not uniform
            if (channel.std > 25) {
                // 25/255 ≈ 10%
                lowVariation = false
            }
        })

        // Get full pixel data for more detailed analysis
        const { data, info } = await sharp(imageBuffer)
            .raw()
            .toBuffer({ resolveWithObject: true })

        const totalPixels = info.width * info.height
        let whitePixels = 0

        // For RGB(A) images, check for white pixels
        const channels = info.channels
        const pixelSize = channels // Number of bytes per pixel

        for (let i = 0; i < data.length; i += pixelSize) {
            // For RGB, consider white if all values are high (close to 255)
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            // More permissive white detection that also catches off-white colors
            const isWhitePixel = r > 230 && g > 230 && b > 230
            if (isWhitePixel) {
                whitePixels++
            }
        }

        const whiteRatio = whitePixels / totalPixels
        log(
            `White pixel ratio: ${whiteRatio.toFixed(
                4
            )} (${whitePixels} of ${totalPixels} pixels)`,
            'debug'
        )
        log(
            `Average brightness: ${avgBrightness.toFixed(
                4
            )}, Low variation: ${lowVariation}`,
            'debug'
        )

        // Consider an image "failed" if:
        // 1. It has a very high percentage of white pixels (exceeding threshold)
        // 2. OR it's very bright overall AND has low variation (meaning it's a nearly uniform light color)
        return (
            whiteRatio > whiteThreshold ||
            (avgBrightness > avgBrightnessThreshold && lowVariation)
        )
    } catch (error) {
        log(`Error checking if image is white: ${error.message}`, 'error')
        return false // Assume not white on error
    }
}

// Root route - serve index.html
app.get('/', (c) =>
    c.html(fs.readFileSync(path.join('public', 'index.html'), 'utf-8'))
)

// API documentation route
app.get('/api', (c) =>
    c.html(fs.readFileSync(path.join('public', 'api.html'), 'utf-8'))
)

// API endpoint for watermark detection
app.post('/detect-watermark', async (c) => {
    try {
        const data = await c.req.formData()
        const image = data.get('image')

        if (!image) {
            log('No image provided for watermark detection', 'error')
            return c.json({ success: false, error: 'No image provided' })
        }

        if (!isValidImageType(image.name)) {
            log(`Invalid file type: ${image.name}`, 'error')
            return c.json({
                success: false,
                error: 'Invalid file type. Supported formats: PNG, JPG, JPEG, WebP, SVG, GIF, BMP, TIFF, AVIF',
            })
        }

        const buffer = await image.arrayBuffer()
        const originalImageData = Buffer.from(buffer)

        // Convert image if needed
        const {
            buffer: processableImageData,
            filename: processableFilename,
            converted,
        } = await convertToSupportedFormat(originalImageData, image.name)

        if (converted) {
            log(
                `Image was converted from ${path.extname(
                    image.name
                )} to ${path.extname(processableFilename)}`,
                'info'
            )
        }

        log(`Processing watermark detection for image: ${image.name}`)
        const detectionResult = await detectWatermarkWithGemini(
            processableImageData,
            processableFilename
        )
        log(`Detection result: ${JSON.stringify(detectionResult)}`)

        return c.json({
            success: true,
            ...detectionResult,
        })
    } catch (error) {
        log(`Error detecting watermark: ${error.message}`, 'error')
        return c.json({ success: false, error: error.message })
    }
})

// API endpoint for watermark removal
app.post('/remove-watermark', async (c) => {
    try {
        const data = await c.req.formData()
        const image = data.get('image')
        const prompt = REMOVAL_PROMPT

        if (!image) {
            log('No image provided for watermark removal', 'error')
            return c.json({ success: false, error: 'No image provided' })
        }

        if (!isValidImageType(image.name)) {
            log(`Invalid file type: ${image.name}`, 'error')
            return c.json({
                success: false,
                error: 'Invalid file type. Supported formats: PNG, JPG, JPEG, WebP, SVG, GIF, BMP, TIFF, AVIF',
            })
        }

        // Get and sanitize the original filename
        const originalFilename = image.name
        const sanitizedFilename = sanitizeFilename(originalFilename)
        const timestamp = Date.now()

        log(`Processing watermark removal for image: ${originalFilename}`)

        const buffer = await image.arrayBuffer()
        const originalImageData = Buffer.from(buffer)

        // Convert image if needed
        const {
            buffer: processableImageData,
            filename: processableFilename,
            converted,
            hasTransparency,
            originalBuffer,
            originalFormat,
        } = await convertToSupportedFormat(originalImageData, image.name)

        if (converted) {
            log(
                `Image was converted from ${path.extname(
                    image.name
                )} to ${path.extname(processableFilename)}`,
                'info'
            )
        }

        // Use the sanitized filename for temporary storage
        const tempPath = path.join(
            uploadDir,
            `temp_${timestamp}_${sanitizedFilename}`
        )
        fs.writeFileSync(tempPath, originalImageData)

        const response = await removeWatermarkWithGemini(
            processableImageData,
            processableFilename,
            prompt
        )
        let textResponse = null
        let jsonResponse = null
        let processedImageData = null
        let imageReturned = false

        // Process the response parts
        if (
            response.candidates &&
            response.candidates[0] &&
            response.candidates[0].content.parts
        ) {
            for (const part of response.candidates[0].content.parts) {
                if (part.text) {
                    try {
                        textResponse = part.text
                        jsonResponse = JSON.parse(textResponse)
                    } catch (e) {
                        textResponse = part.text
                    }
                } else if (part.inlineData && part.inlineData.data) {
                    processedImageData = Buffer.from(
                        part.inlineData.data,
                        'base64'
                    )
                    imageReturned = true
                    log(
                        `Image returned from Gemini, setting imageReturned to true`,
                        'debug'
                    )
                }
            }
        }

        // If no processed image was returned, use the original image
        if (!processedImageData) {
            log(
                'No processed image received from Gemini, using original image',
                'warn'
            )
            processedImageData = originalImageData
            imageReturned = false
            log(
                `Explicitly setting imageReturned to false due to no image`,
                'debug'
            )
            if (!textResponse) {
                textResponse =
                    "The AI model couldn't process the image. The original image has been preserved."
            }
        }

        // Check if the processed image is mostly white (indicating a failed removal)
        if (imageReturned) {
            // Use a stricter threshold (higher value) for images that likely have white backgrounds already
            // Use a more lenient threshold for images that are likely to have colorful backgrounds
            const fileExtension = path.extname(image.name).toLowerCase()
            const whiteThreshold =
                fileExtension === '.jpg' || fileExtension === '.jpeg'
                    ? 0.999
                    : 0.99
            const avgBrightnessThreshold =
                fileExtension === '.jpg' || fileExtension === '.jpeg'
                    ? 0.999
                    : 0.99

            const isMostlyWhite = await isImageMostlyWhite(
                processedImageData,
                whiteThreshold,
                avgBrightnessThreshold
            )
            if (isMostlyWhite) {
                log(
                    `Processed image is mostly white (threshold: ${whiteThreshold}), likely a failed removal. Reverting to original image.`,
                    'warn'
                )
                processedImageData = originalImageData
                imageReturned = false
                if (!textResponse) {
                    textResponse =
                        'The AI model returned a blank or mostly white image, indicating it removed too much content. The original image has been preserved.'
                }
            }
        }

        // Reapply transparency if the original image had it and we got a processed result
        if (hasTransparency && imageReturned && originalBuffer) {
            log(
                'Original image had transparency, reapplying to the processed image',
                'info'
            )
            processedImageData = await reapplyTransparency(
                processedImageData,
                originalBuffer,
                originalFormat
            )
        }

        // Ensure processed image is saved with the correct extension
        let processedFilename = sanitizedFilename
        let outputMimeType = getMimeType(sanitizedFilename)

        if (converted || hasTransparency) {
            // If the original image was converted or had transparency, make sure the processed file uses the PNG extension
            const baseFilename = path.basename(
                processedFilename,
                path.extname(processedFilename)
            )
            processedFilename = `${baseFilename}.png`
            outputMimeType = 'image/png'
            log(
                `Setting output MIME type to ${outputMimeType} for transparency or converted image`,
                'debug'
            )
        }

        // Save processed image with sanitized original filename
        const processedPath = path.join(
            processedDir,
            `processed_${timestamp}_${processedFilename}`
        )
        fs.writeFileSync(processedPath, processedImageData)

        // Clean up the temporary file
        // fs.unlinkSync(tempPath)
        // WILL DO THIS AS A CRONJOB LATER

        // Use the flag directly instead of comparing buffer contents
        const watermarkRemoved = imageReturned
        log(`Setting watermarkRemoved to: ${watermarkRemoved}`, 'debug')

        const result = {
            success: true,
            text: textResponse || 'Image processed successfully',
            image: processedImageData.toString('base64'),
            mimeType: outputMimeType, // Add MIME type to the response
            ...(jsonResponse || {}),
            watermarkRemoved,
        }
        log(
            `Processing completed for ${originalFilename}. Removed: ${result.watermarkRemoved}`
        )

        return c.json(result)
    } catch (error) {
        log(`Error processing image: ${error.message}`, 'error')
        return c.json({ success: false, error: error.message })
    }
})

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok' }))

// Start the server
const port = process.env.PORT || 3000
log(`Server is running on port ${port}`)

serve({
    fetch: app.fetch,
    port,
})
