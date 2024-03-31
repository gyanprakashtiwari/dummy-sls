module.exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: "Gyan : Countries APIs Assignment using AWS Lambda"
      },
      null,
      2
    ),
  };
};
