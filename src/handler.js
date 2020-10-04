/**
 * Ipan Ardian <github.com/ipanardian>
 * 2020
 */

const s3Util = require('./s3-util'),
    childProcessPromise = require('./child-process-promise'),
    path = require('path'),
    os = require('os'),
    EXTENSION = process.env.EXTENSION,
    OUTPUT_BUCKET = process.env.OUTPUT_BUCKET,
    MIME_TYPE = process.env.MIME_TYPE,
    RESOURCE_BUCKET = process.env.RESOURCE_BUCKET,
    ICON_FILE = process.env.ICON_FILE;
 
exports.handler = async (eventObject, context) => {
    return new Promise((resolve, reject) => {
        processFile(eventObject, context).then(resultKey => {
            resolve(resultKey)
        })
        .catch(e => {
            console.log('Caught errors', e)
            reject(Error(e))
        })
    })
}

/**
 * Process the files  
 * 
 * @param {object} eventObject 
 * @param {object} context 
 */
const processFile = async (eventObject, context) => {
    const eventRecord = eventObject.Records && eventObject.Records[0],
        inputBucket = eventRecord.s3.bucket.name,
        key = eventRecord.s3.object.key,
        id = context.awsRequestId,
        resultKey = key.replace(/\.[^.]+$/, EXTENSION),
        workdir = os.tmpdir(),
        inputFile = path.join(workdir, id + path.extname(key)),
        iconFile = path.join(workdir, "icon.png"),
        stitchedVideo = path.join(workdir, 'stitched-' + id + EXTENSION);

    console.log('Starting process', inputBucket, key, 'using', inputFile)

    // Download files
    const [iconPath, targetFile] = await Promise.all([
        s3Util.downloadFileFromS3(RESOURCE_BUCKET, ICON_FILE, iconFile).then(filePath => filePath),
        s3Util.downloadFileFromS3(inputBucket, key, inputFile).then(filePath => filePath)
    ])
    
    // Process files
    await ffmpegProcess({
        targetFile: targetFile,
        iconPath: iconPath,
        stitchedVideo: stitchedVideo,
        workdir: workdir
    })

    // Upload completed file 
    await uploadTargetFile(OUTPUT_BUCKET, resultKey, stitchedVideo, MIME_TYPE)

    console.log('Process completed', OUTPUT_BUCKET, resultKey)

    return resultKey
}
    

/**
 * FFMPEG child process 
 * @param {object} args 
 */
const ffmpegProcess = async (args) => {
    const command = '/opt/bin/ffmpeg'
    let argsarray = ['-loglevel', 'error', '-i', args.targetFile, '-i', args.iconPath, '-filter_complex', 'overlay=10:main_h-overlay_h-10', args.stitchedVideo]

    return childProcessPromise.spawn(command, argsarray, {
        env: process.env,
        cwd: args.workdir
    })
}

/**
 * Upload the result file to a bucket
 * @param {string} bucket 
 * @param {string} fileKey 
 * @param {string} filePath 
 * @param {string} contentType 
 */
const uploadTargetFile = async (bucket, fileKey, filePath, contentType) => {
    return s3Util.uploadFileToS3(bucket, fileKey, filePath, contentType)
}
