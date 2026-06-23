/**
 * TFDS Daily Flow Producer
 * 
 * This Google Apps Script processes traffic disturbance data by querying InfluxDB
 * for running mean speeds and mapping them to geographical segments. The results
 * are then exported as GeoJSON to Google Cloud Storage.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open the 'setConfiguration' function.
 * 2. Replace all 'REPLACE_WITH_...' placeholders with your actual service credentials and URLs.
 * 3. Run the 'setConfiguration' function once from the script editor to save these as Script Properties.
 * 4. For security, you should clear your sensitive credentials from the 'setConfiguration' function 
 *    before sharing or committing the code.
 */

/**
 * Sets script properties for InfluxDB and GCS access.
 * This function should be run once to configure the script.
 * After running, you can delete or comment out the call to this function in run().
 */
function setConfiguration() {
  const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
  
  // InfluxDB Connection Details
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_URL', 'REPLACE_WITH_YOUR_INFLUXDB_URL');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_TOKEN', 'REPLACE_WITH_YOUR_INFLUXDB_TOKEN');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_ORG', 'REPLACE_WITH_YOUR_ORG_ID');
  SCRIPT_PROPERTIES.setProperty('INFLUXDB_BUCKET', 'REPLACE_WITH_YOUR_BUCKET_NAME');
  
  // Google Cloud Storage Configuration
  // Note: Ensure the script has 'https://www.googleapis.com/auth/cloud-platform' scope if accessing private buckets.
  SCRIPT_PROPERTIES.setProperty('GCS_OUTPUT_BUCKET', 'REPLACE_WITH_YOUR_OUTPUT_BUCKET');
  SCRIPT_PROPERTIES.setProperty('GCS_OUTPUT_FILENAME', 'roadworks_max_passability.json');
  
  // Source URLs for required JSON data (e.g., hosted on GCS or other public/private endpoints)
  SCRIPT_PROPERTIES.setProperty('GCS_TRAFFIC_DISTURBANCE_URL', 'REPLACE_WITH_YOUR_TRAFFIC_DISTURBANCE_URL');
  SCRIPT_PROPERTIES.setProperty('GCS_SEGMENTS_MAPPING_URL', 'REPLACE_WITH_YOUR_SEGMENTS_MAPPING_URL');
  
  // Output filename for the processed disturbance data
  SCRIPT_PROPERTIES.setProperty('GCS_DISTURBANCE_OUTPUT_FILENAME', 'traffic_disturbance_max_running_mean.json');
  
  Logger.log('Configuration properties have been set. Please remember to remove sensitive information from this function.');
}

/**
 * Retrieves segments mapping from a JSON file in Google Cloud Storage.
 * @return {Object|null} The segments mapping data, or null if fetch fails.
 */
function fetchSegmentsMapping() {
  const url = getScriptProperty('GCS_SEGMENTS_MAPPING_URL');
  if (!url || url.indexOf('REPLACE_WITH') === 0) {
    Logger.log('GCS_SEGMENTS_MAPPING_URL is not configured.');
    return null;
  }

  try {
    const token = ScriptApp.getOAuthToken();
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      Logger.log(`Error fetching segments mapping. Status: ${responseCode}. Body: ${response.getContentText()}`);
      return null;
    }

    Logger.log('Successfully fetched segments mapping.');
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log(`Error fetching segments mapping: ${e.toString()}`);
    return null;
  }
}

/**
 * Retrieves segment geometry from a JSON file in Google Cloud Storage.
 * This version uses an OAuth token to access non-public buckets.
 * @return {Object.<string, Object>|null} A dictionary mapping segment IDs to geometry data, or null if fetch fails.
 */
function fetchSegmentGeometry() {
  const url = getScriptProperty('GCS_JSON_URL');
  if (!url || url.indexOf('REPLACE_WITH') === 0) {
    Logger.log('GCS_JSON_URL is not configured.');
    return null;
  }

  try {
    // Get OAuth token to access private GCS bucket
    // Requires scope: https://www.googleapis.com/auth/cloud-platform
    const token = ScriptApp.getOAuthToken();
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      Logger.log(`Error fetching segment geometry. Status: ${responseCode}. Body: ${response.getContentText()}`);
      return null;
    }

    const json = JSON.parse(response.getContentText());
    
    // Based on the expected structure, geometry might be under a "segmentId" key
    return json.segmentId || json;
  } catch (e) {
    Logger.log(`Error fetching segment geometry: ${e.toString()}`);
    return null;
  }
}

/**
 * Writes data to a Google Cloud Storage bucket using the JSON API.
 * @param {string} content The content to write (typically stringified GeoJSON).
 * @param {string} [outputFilenameKey] Optional: Key for the script property holding the output filename.
 * @return {boolean} True if successful, false otherwise.
 */
function writeToGCS(content, outputFilenameKey) {
  const bucket = getScriptProperty('GCS_OUTPUT_BUCKET');
  let filename = getScriptProperty('GCS_OUTPUT_FILENAME'); // Default filename

  if (outputFilenameKey) {
    const customFilename = getScriptProperty(outputFilenameKey);
    if (customFilename) {
      filename = customFilename;
    }
  }
  
  if (!bucket || !filename || bucket.indexOf('REPLACE_WITH') === 0) {
    Logger.log('GCS output configuration missing or invalid.');
    return false;
  }

  // Use the GCS JSON API for media uploads
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(filename)}`;
  
  try {
    const token = ScriptApp.getOAuthToken();
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      payload: content,
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200 || responseCode === 201) {
      Logger.log(`Successfully wrote data to GCS: ${filename}`);
      return true;
    } else {
      Logger.log(`Error writing to GCS. Status: ${responseCode}. Body: ${response.getContentText()}`);
      return false;
    }
  } catch (e) {
    Logger.log(`Error writing to GCS: ${e.toString()}`);
    return false;
  }
}

/**
 * Retrieves and processes traffic disturbance data from Google Cloud Storage.
 * Creates a dictionary mapping traffic_disturbance_id to its properties and segments.
 * @return {Object.<string, Object>|null} A dictionary with traffic_disturbance_id as keys, or null if fetch fails.
 */
function fetchAndProcessTrafficDisturbanceData() {
  const url = getScriptProperty('GCS_TRAFFIC_DISTURBANCE_URL');
  if (!url || url.indexOf('REPLACE_WITH') === 0) {
    Logger.log('GCS_TRAFFIC_DISTURBANCE_URL is not configured.');
    return null;
  }

  try {
    const token = ScriptApp.getOAuthToken();
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      Logger.log(`Error fetching traffic disturbance data. Status: ${responseCode}. Body: ${response.getContentText()}`);
      return null;
    }

    let trafficData = JSON.parse(response.getContentText());
    // Handle nested structure if data is under a "segmentId" key
    if (trafficData && trafficData.segmentId) {
      trafficData = trafficData.segmentId;
    }
    
    const disturbanceToSegments = {};

    for (const segmentId in trafficData) {
      if (trafficData.hasOwnProperty(segmentId)) {
        const segment = trafficData[segmentId];
        if (segment.detailedCollisions && Array.isArray(segment.detailedCollisions)) {
          segment.detailedCollisions.forEach(collision => {
            if (collision.properties && collision.properties.traffic_disturbance_id) {
              const disturbanceId = collision.properties.traffic_disturbance_id;
              if (!disturbanceToSegments[disturbanceId]) {
                disturbanceToSegments[disturbanceId] = {
                  properties: collision.properties,
                  segments: []
                };
              }
              // Add segmentId to the segments array for this disturbance
              if (disturbanceToSegments[disturbanceId].segments.indexOf(segmentId) === -1) {
                disturbanceToSegments[disturbanceId].segments.push(segmentId);
              }
            }
          });
        }
      }
    }
    Logger.log('Successfully processed traffic disturbance data.');
    return disturbanceToSegments;

  } catch (e) {
    Logger.log(`Error fetching or processing traffic disturbance data: ${e.toString()}`);
    return null;
  }
}

/**
 * Queries InfluxDB using a Flux query to retrieve running mean values.
 * @param {Object.<string, Object>} disturbanceToSegments Dictionary mapping disturbance IDs to segment data.
 * @param {number} [threshold] Optional: Speed ratio threshold to filter results.
 * @return {Object.<string, Object>|null} Processed results per disturbance, or null if query fails.
 */
function queryInfluxDB(disturbanceToSegments, threshold) {
  const INFLUXDB_URL = getScriptProperty('INFLUXDB_URL');
  const INFLUXDB_TOKEN = getScriptProperty('INFLUXDB_TOKEN');
  const INFLUXDB_ORG = getScriptProperty('INFLUXDB_ORG');
  const INFLUXDB_BUCKET = getScriptProperty('INFLUXDB_BUCKET');

  if (!INFLUXDB_URL || !INFLUXDB_TOKEN || !INFLUXDB_ORG || !INFLUXDB_BUCKET || INFLUXDB_URL.indexOf('REPLACE_WITH') === 0) {
    Logger.log('InfluxDB properties are not set. Please run setConfiguration() first.');
    return null;
  }

  // Flux query to get the maximum running_mean in the last 24 hours
  const FLUX_QUERY = `from(bucket: "${INFLUXDB_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r["_measurement"] == "idea_validation")
  |> filter(fn: (r) => r["_field"] == "running_mean")
  |> aggregateWindow(every: 24h, fn: max, createEmpty: false)
  |> yield(name: "max")`;

  const url = `${INFLUXDB_URL}/query?org=${INFLUXDB_ORG}`;

  const options = {
    method: 'post',
    headers: {
      'Authorization': `Token ${INFLUXDB_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    payload: FLUX_QUERY,
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode === 200) {
      Logger.log('InfluxDB Query Successful.');
      const parsedData = parseInfluxCsvResponse(responseBody);
      const results = processInfluxDataForDisturbances(parsedData, disturbanceToSegments);
      
      // Future expansion: merge geometry, filter by threshold, etc.
      return results;
    } else {
      Logger.log(`InfluxDB Query Failed with code: ${responseCode}. Body: ${responseBody}`);
      return null;
    }
  } catch (e) {
    Logger.log(`Error querying InfluxDB: ${e.toString()}`);
    return null;
  }
}

/**
 * Main execution function to trigger the processing flow.
 */
function run() {
  // setConfiguration(); // Uncomment and run once to initialize properties. Depending the deployment, you may enable this to ensure config is set prior to run.
  
  const disturbanceSegments = fetchAndProcessTrafficDisturbanceData();
  const segmentsMapping = fetchSegmentsMapping();
  
  if (disturbanceSegments && segmentsMapping) {
    const maxRunningMeans = queryInfluxDB(disturbanceSegments);
    
    if (maxRunningMeans) {
      // Create GeoJSON features, filtering out entries with 0 running mean
      const features = Object.keys(maxRunningMeans)
        .filter(disturbanceId => maxRunningMeans[disturbanceId].highest_running_mean !== 0)
        .map(disturbanceId => {
          const disturbanceData = maxRunningMeans[disturbanceId];
          const segments = disturbanceSegments[disturbanceId] ? disturbanceSegments[disturbanceId].segments : [];
          
          const center = calculateCenterPoint(segments, segmentsMapping);
          
          const feature = {
            type: 'Feature',
            geometry: null,
            properties: disturbanceData
          };

          if (center) {
            feature.geometry = {
              type: 'Point',
              coordinates: [center.longitude, center.latitude]
            };
            // Clean up redundant properties if they were included in the original properties
            delete disturbanceData.center_longitude;
            delete disturbanceData.center_latitude;
          }
          
          return feature;
        });

      const geoJson = {
        type: 'FeatureCollection',
        features: features
      };
      
      writeToGCS(JSON.stringify(geoJson), 'GCS_DISTURBANCE_OUTPUT_FILENAME');
    }
  } else {
    Logger.log('Required data (disturbances or mapping) could not be fetched. Check configuration.');
  }
}

/**
 * Calculates the average center point for a list of segments.
 * @param {Array<string>} segmentIds List of segment IDs.
 * @param {Object} segmentsMapping The mapping data containing segment geometries.
 * @return {Object|null} An object with longitude and latitude, or null if no coordinates found.
 */
function calculateCenterPoint(segmentIds, segmentsMapping) {
  let totalLon = 0;
  let totalLat = 0;
  let count = 0;

  const mapping = segmentsMapping.segmentId || segmentsMapping;

  segmentIds.forEach(id => {
    const segment = mapping[id];
    if (segment && segment.geometry && segment.geometry.coordinates) {
      segment.geometry.coordinates.forEach(coord => {
        // coordinates are [longitude, latitude]
        totalLon += coord[0];
        totalLat += coord[1];
        count++;
      });
    }
  });

  if (count === 0) return null;

  return {
    longitude: totalLon / count,
    latitude: totalLat / count
  };
}


/**
 * Helper to retrieve a script property.
 * @param {string} key The key of the property.
 * @return {string} The property value.
 */
function getScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Parses InfluxDB CSV response into an array of objects.
 * @param {string} csvData The CSV data from InfluxDB.
 * @return {Array<Object>} Array of parsed entries with segmentId and running_mean.
 */
function parseInfluxCsvResponse(csvData) {
  Logger.log('Parsing InfluxDB CSV response...');
  const lines = csvData.split('\n');
  const parsedResults = [];

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(',result,table,')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    Logger.log('Could not find header row in InfluxDB CSV response.');
    return [];
  }

  const header = lines[headerIndex].split(',').map(h => h.replace(/[\r\n]+/g, ''));
  const valueIndex = header.indexOf('_value');
  const segmentIdIndex = header.indexOf('segmentId');

  if (valueIndex === -1 || segmentIdIndex === -1) {
    Logger.log('Required columns (_value or segmentId) not found in InfluxDB CSV response.');
    return [];
  }

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const parts = line.split(',');
    if (parts.length > valueIndex && parts.length > segmentIdIndex) {
      const runningMean = parseFloat(parts[valueIndex]);
      const segmentId = parts[segmentIdIndex];

      if (!isNaN(runningMean) && segmentId) {
        parsedResults.push({
          segmentId: segmentId,
          running_mean: runningMean
        });
      }
    }
  }
  Logger.log(`Parsed ${parsedResults.length} InfluxDB data entries.`);
  return parsedResults;
}

/**
 * Processes parsed InfluxDB data to find the highest running_mean for each traffic_disturbance_id.
 * @param {Array<Object>} influxData Parsed InfluxDB data.
 * @param {Object.<string, Object>} disturbanceToSegments Disturbance mapping.
 * @return {Object.<string, Object>} Map of disturbanceId to its highest running mean and properties.
 */
function processInfluxDataForDisturbances(influxData, disturbanceToSegments) {
  Logger.log('Processing InfluxDB data for disturbances...');
  const resultsPerDisturbance = {};
  const segmentToDisturbances = {};

  // Build a reverse mapping from segment to disturbances
  for (const disturbanceId in disturbanceToSegments) {
    if (disturbanceToSegments.hasOwnProperty(disturbanceId)) {
      disturbanceToSegments[disturbanceId].segments.forEach(segmentId => {
        if (!segmentToDisturbances[segmentId]) {
          segmentToDisturbances[segmentId] = [];
        }
        segmentToDisturbances[segmentId].push(disturbanceId);
      });
    }
  }

  influxData.forEach(entry => {
    const segmentId = entry.segmentId;
    const runningMean = entry.running_mean;
    const associatedDisturbanceIds = segmentToDisturbances[segmentId];

    if (associatedDisturbanceIds) {
      associatedDisturbanceIds.forEach(disturbanceId => {
        if (!resultsPerDisturbance[disturbanceId]) {
          resultsPerDisturbance[disturbanceId] = {
            ...disturbanceToSegments[disturbanceId].properties,
            highest_running_mean: runningMean
          };
        } else if (runningMean > resultsPerDisturbance[disturbanceId].highest_running_mean) {
          resultsPerDisturbance[disturbanceId].highest_running_mean = runningMean;
        }
      });
    }
  });
  Logger.log('Finished processing InfluxDB data for disturbances.');
  return resultsPerDisturbance;
}
