'use strict';

/**
 * Required Env Vars:
 * ELASTIC_TRANSCODER_REGION
 * ELASTIC_TRANSCODER_PIPELINE_ID
 * DATABASE_URL
 */


const AWS = require('aws-sdk');
const firebase = require('firebase-admin');
const serviceAccount = require(`./key.json`);

const elasticTranscoder = new AWS.ElasticTranscoder({
    region: process.env.ELASTIC_TRANSCODER_REGION
});

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount),
    databaseURL: process.env.DATABASE_URL
});

const generateTranscoderParams = (sourceKey, outputKey, transcoderPipelineID) => {
    const params = {
        PipelineId: transcoderPipelineID,
        OutputKeyPrefix: outputKey + '/',
        Input: {
            Key: sourceKey
        },
        Outputs: [{
                Key: outputKey + '-web-480p' + '.mp4',
                PresetId: '1351620000001-000020' //480p 16:9 format
            },
            {
                Key: outputKey + '-720p' + '.mp4',
                PresetId: '1351620000001-000010' //Generic 720p
            },
            {
                Key: outputKey + '-web-720p' + '.mp4',
                PresetId: '1351620000001-100070' //Web Friendly 720p
            },
            {
                Key: outputKey + '-1080p' + '.mp4',
                PresetId: '1351620000001-000001' //Generic 1080p
            }
        ]
    };

    return params;
};

const pushVideoEntryToFirebase = (key) => {
    console.log("Adding video entry to firebase at key:", key);

    const database = firebase.database().ref();

    // create a unique entry for this video in firebase
    return database.child('videos').child(key)
        .set({
            transcoding: true
        });
};

const handler = (event, context, callback) => {

    context.callbackWaitsForEmptyEventLoop = false;
    const pipelineID = process.env.ELASTIC_TRANSCODER_PIPELINE_ID;

    const key = event.Records[0].s3.object.key;
    console.log("Object key:", key);

    //the input file may have spaces so replace them with '+'
    const sourceKey = decodeURIComponent(key.replace(/\+/g, ' '));
    console.log("Source key:", sourceKey);

    //remove the extension
    const outputKey = sourceKey.split('.')[0];
    console.log("Output key:", sourceKey);

    // get the unique video key (the folder name)
    const uniqueVideoKey = outputKey.split('/')[0];

    const params = generateTranscoderParams(sourceKey, outputKey, pipelineID);

    return elasticTranscoder.createJob(params)
        .promise()
        .then((data) => {
            // the transcoding job started, so let's make a record in firebase
            // that the UI can show right away
            console.log("Elastic transcoder job created successfully");
            return pushVideoEntryToFirebase(uniqueVideoKey);
        })
        .then(() => {
            callback(null, 'Video Saved');
        })
        .catch((error) => {
            console.log("Error creating elastic transcoder job.");
            callback(error);
        });
};


module.exports = {
    handler
};