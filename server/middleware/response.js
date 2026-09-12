const success = (data = null, message = '操作成功') => {
  return {
    code: 0,
    success: true,
    message,
    data
  };
};

const error = (code = -1, message = '操作失败', data = null) => {
  return {
    code,
    success: false,
    message,
    data
  };
};

module.exports = {
  success,
  error
};
