import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import AWS from "aws-sdk";
import { v4 } from "uuid";
import * as yup from "yup";

const docClient = new AWS.DynamoDB.DocumentClient();
const CountryTableName = "CountryTable";
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

/*
export const updateProduct = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const id = event.pathParameters?.id as string;

    await fetchProductById(id);

    const reqBody = JSON.parse(event.body as string);

    await schema.validate(reqBody, { abortEarly: false });

    const product = {
      ...reqBody,
      productID: id,
    };

    await docClient
      .put({
        TableName: tableName,
        Item: product,
      })
      .promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(product),
    };
  } catch (e) {
    return handleError(e);
  }
};

export const deleteProduct = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const id = event.pathParameters?.id as string;

    await fetchProductById(id);

    await docClient
      .delete({
        TableName: tableName,
        Key: {
          productID: id,
        },
      })
      .promise();

    return {
      statusCode: 204,
      body: "",
    };
  } catch (e) {
    return handleError(e);
  }
};

export const listProduct = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const output = await docClient
    .scan({
      TableName: tableName,
    })
    .promise();

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(output.Items),
  };
};
*/
