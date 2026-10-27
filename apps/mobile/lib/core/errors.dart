class ApiException implements Exception {
  ApiException({
    required this.message,
    this.statusCode,
    this.code,
    this.details,
  });

  final String message;
  final int? statusCode;
  final String? code;
  final Object? details;

  @override
  String toString() => message;
}

String userFacingError(Object error) {
  if (error is ApiException) return error.message;
  final text = error.toString();
  if (text.contains('SocketException') || text.contains('Connection refused')) {
    return 'Cannot reach the API. Check API base URL and that the server is running.';
  }
  if (text.contains('TimeoutException') || text.contains('timed out')) {
    return 'Request timed out. Try again.';
  }
  return text.replaceFirst('Exception: ', '');
}
