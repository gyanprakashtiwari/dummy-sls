import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import AWS from "aws-sdk";
import { v4 } from "uuid";
import * as yup from "yup";

const docClient = new AWS.DynamoDB.DocumentClient();
const CountryTableName = "CountryTable";
const NeighborCountryTableName = "NeighborsTable";

const headers = {
  "content-type": "application/json",
};

const countrySchema = yup.object().shape({
  name: yup.string().required(),
  capital: yup.string().required(),
  region: yup.string().required(),
  currency: yup.string().required(),
});

export const addCountry = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      throw new Error("Request body is missing");
    }
    const requestBody = JSON.parse(event.body as string);

    if (!Array.isArray(requestBody)) {
      throw new Error("Request body should be an array of countries.");
    }

    const isValid = await Promise.all(
      requestBody.map(async (country: any) => {
        try {
          await countrySchema.validate(country);
          return true;
        } catch (validationError: any) {
          throw new Error(
            `Validation error for country: ${validationError.message}`
          );
        }
      })
    );

    if (!isValid.every((valid) => valid)) {
      throw new Error("One or more countries failed validation.");
    }

    const countries = requestBody.map((country: any) => ({
      ...country,
      countryID: v4(),
    }));

    const putRequests = countries.map((country: any) => ({
      PutRequest: {
        Item: country,
      },
    }));

    const batchWriteParams = {
      RequestItems: {
        [CountryTableName]: putRequests,
      },
    };

    await docClient.batchWrite(batchWriteParams).promise();

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(countries),
    };
  } catch (error: any) {
    console.error("Error in addCountry function:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: "Internal Server Error",
        error: error.message,
      }),
    };
  }
};

class HttpError extends Error {
  constructor(public statusCode: number, body: Record<string, unknown> = {}) {
    super(JSON.stringify(body));
  }
}

export const getCountryByID = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const country = await fetchCountryById(event.pathParameters?.id as string);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(country),
    };
  } catch (e) {
    return handleError(e);
  }
};

const fetchCountryById = async (id: string) => {
  const output = await docClient
    .get({
      TableName: CountryTableName,
      Key: {
        countryID: id,
      },
    })
    .promise();

  if (!output.Item) {
    throw new HttpError(404, { error: "not found" });
  }

  return output.Item;
};

const handleError = (e: unknown) => {
  if (e instanceof yup.ValidationError) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        errors: e.errors,
      }),
    };
  }

  if (e instanceof SyntaxError) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: `invalid request body format : "${e.message}"`,
      }),
    };
  }

  if (e instanceof HttpError) {
    return {
      statusCode: e.statusCode,
      headers,
      body: e.message,
    };
  }

  throw e;
};

export const getAllCountriesPaginated = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    let {
      page = "1",
      limit = "10",
      sort_by = "a_to_z",
      search,
    } = event.queryStringParameters || {};
    let skip = (parseInt(page) - 1) * parseInt(limit);
    let sortKey: string;
    let sortDirection: number = 1;

    // Determine sorting criteria
    switch (sort_by) {
      case "a_to_z":
        sortKey = "name";
        sortDirection = 1;
        break;
      case "z_to_a":
        sortKey = "name";
        sortDirection = -1;
        break;
      case "population_high_to_low":
        sortKey = "population";
        sortDirection = -1;
        break;
      case "population_low_to_high":
        sortKey = "population";
        sortDirection = 1;
        break;
      case "area_high_to_low":
        sortKey = "area";
        sortDirection = -1;
        break;
      case "area_low_to_high":
        sortKey = "area";
        sortDirection = 1;
        break;
      default:
        sortKey = "name";
        sortDirection = 1;
        break;
    }

    // Set up query parameters
    let params: AWS.DynamoDB.DocumentClient.ScanInput = {
      TableName: CountryTableName,
    };

    // Add search filter if provided
    if (search) {
      const searchRegex = new RegExp(search, "i");
      params.FilterExpression =
        "contains(#name, :search) OR contains(#region, :search) OR contains(#subregion, :search)";
      params.ExpressionAttributeNames = {
        "#name": "name",
        "#region": "region",
        "#subregion": "subregion",
      };
      params.ExpressionAttributeValues = {
        ":search": searchRegex.source, // Use source to extract regex pattern string
      };
    }

    // Perform the query
    const output: any = await docClient.scan(params).promise();

    // Sort the results
    if (sortKey) {
      output.Items.sort((a: any, b: any) => {
        const aValue = a[sortKey];
        const bValue = b[sortKey];
        return aValue < bValue
          ? -1 * sortDirection
          : aValue > bValue
          ? 1 * sortDirection
          : 0;
      });
    }

    // Paginate the results
    const totalCountries = output.Items.length;
    const totalPages = Math.ceil(totalCountries / parseInt(limit));
    const countries = output.Items.slice(skip, skip + parseInt(limit));

    // Prepare response
    const hasNext = parseInt(page) < totalPages;
    const hasPrev = parseInt(page) > 1;

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Country list",
        data: {
          list: countries,
          has_next: hasNext,
          has_prev: hasPrev,
          page: parseInt(page),
          pages: totalPages,
          per_page: parseInt(limit),
          total: totalCountries,
        },
      }),
    };
  } catch (error) {
    console.error("Error fetching countries:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error", data: {} }),
    };
  }
};

export const getCountryNeighbors = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { countryID } = event.pathParameters || {};

    // Retrieve the country from the CountriesTable
    const country = await fetchCountryById(countryID as string);

    if (!country) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: "Country not found", data: {} }),
      };
    }

    // Retrieve neighbors from the NeighborsTable
    const neighbors = await fetchNeighborsByCountryId(countryID as string);

    if (neighbors.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: "Country neighbours",
          data: { countries: [] },
        }),
      };
    } else {
      const neighborCountries = await Promise.all(
        neighbors.map(async (neighborId: any) => {
          const neighbor = await fetchCountryById(neighborId);
          return {
            id: neighbor.countryID,
            name: neighbor.name,
            currency: neighbor.currency,
            capital: neighbor.capital,
            region: neighbor.region,
          };
        })
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: "Neighbour countries list",
          data: { countries: neighborCountries },
        }),
      };
    }
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: error.statusCode,
      headers,
      body: JSON.stringify({
        message: "Some Error",
        error: error.message,
      }),
    };
  }
};

const fetchNeighborsByCountryId = async (
  countryID: string
): Promise<string[]> => {
  const result = await docClient
    .query({
      TableName: NeighborCountryTableName,
      KeyConditionExpression: "countryID = :countryID",
      ExpressionAttributeValues: {
        ":countryID": countryID,
      },
    })
    .promise();

  return result.Items ? result.Items.map((item) => item.neighborId) : [];
};

export const addNeighbors = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { countryID } = event.pathParameters || {};

    const requestBody = JSON.parse(event.body as string);
    const neighborData: { neighborId: string }[] = requestBody.neighbors;

    const country = await fetchCountryById(countryID as string);
    if (!country) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: "Country not found", data: {} }),
      };
    }

    const existingCountryIds = await fetchAllCountryIds();

    const errors: string[] = [];
    const successfulAdditions: string[] = [];

    for (const neighborObj of neighborData) {
      const neighborId = neighborObj.neighborId;

      if (!existingCountryIds.includes(neighborId)) {
        errors.push(`Invalid neighbor country ID: ${neighborId}`);
        continue;
      }

      const existingNeighbor = await fetchNeighbor(
        countryID as string,
        neighborId
      );
      if (existingNeighbor) {
        errors.push(
          `Neighbor with ID ${neighborId} already exists for this country`
        );
        continue;
      }

      await addNeighbor(countryID as string, neighborId);
      successfulAdditions.push(neighborId);
    }

    if (successfulAdditions.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: "Failed to add neighbors",
          data: { neighbors: [], errors },
        }),
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: "Neighbors added successfully",
          data: { neighbors: successfulAdditions },
          errors,
        }),
      };
    }
  } catch (error: any) {
    return {
      statusCode: error.statusCode,
      headers,
      body: JSON.stringify({
        message: "Internal Server Error",
        error: error.message,
      }),
    };
  }
};

const fetchAllCountryIds = async (): Promise<string[]> => {
  const result = await docClient
    .scan({
      TableName: CountryTableName,
      ProjectionExpression: "countryID",
    })
    .promise();

  return result.Items ? result.Items.map((item) => item.countryID) : [];
};

const fetchNeighbor = async (
  countryID: string,
  neighborId: string
): Promise<any> => {
  const output = await docClient
    .get({
      TableName: NeighborCountryTableName,
      Key: {
        countryID: countryID,
        neighborId: neighborId,
      },
    })
    .promise();

  return output.Item;
};

const addNeighbor = async (
  countryID: string,
  neighborId: string
): Promise<void> => {
  await docClient
    .put({
      TableName: NeighborCountryTableName,
      Item: {
        countryID: countryID,
        neighborId: neighborId,
      },
    })
    .promise();
};
